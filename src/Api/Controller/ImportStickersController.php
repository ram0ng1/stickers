<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Ramon\Stickers\Api\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Database\QueryException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;
use Ramon\Stickers\StickerFiles;

class ImportStickersController implements RequestHandlerInterface
{
    public const MAX_ZIP_BYTES = 64 * 1024 * 1024;        // ZIP comprimido
    public const MAX_ENTRY_BYTES = 8 * 1024 * 1024;       // cada arquivo extraído
    public const MAX_TOTAL_EXTRACTED = 256 * 1024 * 1024; // total extraído (zip bomb)
    public const MAX_METADATA_BYTES = 8 * 1024 * 1024;    // stickers.json extraído
    public const ALLOWED_EXTENSIONS = ['json', 'tgs', 'png', 'apng', 'gif', 'webp', 'jpg', 'jpeg'];

    /** Mesmo formato que o StickerResource exige do `textToReplace`. */
    public const TEXT_TO_REPLACE = '/^:[\w\-]+:$/i';

    public function __construct(
        protected StickerFiles $files
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        RequestUtil::getActor($request)->assertAdmin();

        $uploadedFiles = $request->getUploadedFiles();

        // ZIP: stickers.json + os arquivos.
        if (! empty($uploadedFiles['file']) && $uploadedFiles['file'] instanceof UploadedFileInterface) {
            return $this->handleZipImport($uploadedFiles['file']);
        }

        // JSON antigo: só os metadados, os arquivos já precisam estar no servidor.
        $data = Arr::get((array) $request->getParsedBody(), 'data', []);

        return $this->importData(is_array($data) ? $data : [])['response'];
    }

    private function handleZipImport(UploadedFileInterface $uploadedFile): ResponseInterface
    {
        if ($uploadedFile->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['error' => 'Upload error: '.$uploadedFile->getError()], 400);
        }

        $size = $uploadedFile->getSize();
        if ($size === null || $size <= 0 || $size > self::MAX_ZIP_BYTES) {
            return new JsonResponse(['error' => 'ZIP size invalid or exceeds limit'], 400);
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'stickers_import_');
        $written = [];

        try {
            $uploadedFile->moveTo($tmpFile);

            $zip = new \ZipArchive();
            if ($zip->open($tmpFile) !== true) {
                return new JsonResponse(['error' => 'Invalid ZIP file'], 400);
            }

            try {
                // Lido com limite: um stickers.json que descomprime para GBs
                // estouraria a memória antes de qualquer outra checagem.
                $metadataJson = $zip->getFromName('stickers.json', self::MAX_METADATA_BYTES + 1);
                if ($metadataJson === false) {
                    return new JsonResponse(['error' => 'stickers.json not found inside the ZIP'], 400);
                }
                if (strlen($metadataJson) > self::MAX_METADATA_BYTES) {
                    return new JsonResponse(['error' => 'Archive content too large'], 400);
                }

                $metadata = json_decode($metadataJson, true);
                if (! is_array($metadata)) {
                    return new JsonResponse(['error' => 'stickers.json contains invalid JSON'], 400);
                }

                $dir = $this->files->directory().'/';
                if (! is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }

                // Nome no ZIP → nome aleatório gravado no servidor.
                $renameMap = [];
                $totalBytes = 0;

                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entryName = (string) $zip->getNameIndex($i);
                    if (! str_starts_with($entryName, 'files/') || $entryName === 'files/') {
                        continue;
                    }

                    $stat = $zip->statIndex($i);
                    if ((int) ($stat['size'] ?? 0) > self::MAX_ENTRY_BYTES) {
                        continue; // descarta só esta entrada, não a importação inteira
                    }

                    $originalBasename = basename($entryName);
                    $extension = strtolower(pathinfo($originalBasename, PATHINFO_EXTENSION));
                    if (! in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
                        continue;
                    }

                    $content = $zip->getFromIndex($i, self::MAX_ENTRY_BYTES + 1);
                    if ($content === false || strlen($content) > self::MAX_ENTRY_BYTES) {
                        continue;
                    }

                    // Conta o que foi de fato extraído: o tamanho declarado vem do
                    // próprio ZIP e pode mentir.
                    $totalBytes += strlen($content);
                    if ($totalBytes > self::MAX_TOTAL_EXTRACTED) {
                        return new JsonResponse(['error' => 'Archive content too large'], 400);
                    }

                    if (! $this->mimeMatches($content, $extension)) {
                        continue;
                    }

                    // Nome gerado no servidor; o do ZIP é ignorado.
                    $newFilename = bin2hex(random_bytes(16)).'.'.$extension;
                    $dest = $dir.$newFilename;

                    if (file_put_contents($dest, $content) !== false) {
                        @chmod($dest, 0644);
                        $written[] = '/assets/stickers/'.$newFilename;
                        $renameMap[$originalBasename] = $newFilename;
                    }
                }
            } finally {
                $zip->close();
            }

            // Troca os caminhos pelos nomes novos; entradas cujo arquivo foi
            // recusado acima ficam de fora (seriam stickers quebrados).
            $validated = [];
            foreach ($metadata as $item) {
                if (! is_array($item)) {
                    continue;
                }
                if (! empty($item['file'])) {
                    $oldBase = basename((string) $item['file']);
                    if (! isset($renameMap[$oldBase])) {
                        continue;
                    }
                    $item['path'] = '/assets/stickers/'.$renameMap[$oldBase];
                    unset($item['file']);
                }
                $validated[] = $item;
            }

            $result = $this->importData($validated);

            // Arquivos que não viraram sticker (duplicado, inválido, sem entrada
            // no stickers.json) não ficam no disco.
            $written = array_diff($written, $result['paths']);

            return $result['response'];
        } finally {
            foreach ($written as $path) {
                if (($file = $this->files->resolve($path)) !== null) {
                    @unlink($file);
                }
            }

            @unlink($tmpFile);
        }
    }

    /**
     * @param array<mixed> $data
     * @return array{response: JsonResponse, paths: list<string>}
     */
    private function importData(array $data): array
    {
        $imported = 0;
        $skipped = 0;
        $paths = [];

        // 1ª passada: valida em memória e junta os text_to_replace candidatos,
        // para checar os existentes com um WHERE IN por lote, não um EXISTS por linha.
        $candidates = [];
        foreach ($data as $i => $item) {
            if (! is_array($item)) {
                $skipped++;
                continue;
            }

            $textToReplace = mb_substr(trim((string) Arr::get($item, 'text_to_replace', '')), 0, 100);
            $path = (string) Arr::get($item, 'path', '');

            // Mesmas regras da API: um código como "a" viraria sticker em todo
            // "a" de todos os posts.
            if (! preg_match(self::TEXT_TO_REPLACE, $textToReplace) || ! $this->isValidStickerPath($path)) {
                $skipped++;
                continue;
            }

            $candidates[$i] = [
                'text_to_replace' => $textToReplace,
                'path'            => $path,
                'item'            => $item,
            ];
        }

        // Lotes de 500 por causa do limite de placeholders do MySQL. A garantia
        // de verdade contra corrida é o índice UNIQUE do banco; isto só evita
        // INSERTs que falhariam.
        $existing = [];
        $values = array_values(array_unique(array_column($candidates, 'text_to_replace')));
        foreach (array_chunk($values, 500) as $chunk) {
            $found = Sticker::query()->whereIn('text_to_replace', $chunk)->pluck('text_to_replace')->all();
            foreach ($found as $v) {
                $existing[$v] = true;
            }
        }

        // Duplicados dentro da própria importação.
        $seenInBatch = [];

        foreach ($candidates as $row) {
            $textToReplace = $row['text_to_replace'];

            if (isset($existing[$textToReplace]) || isset($seenInBatch[$textToReplace])) {
                $skipped++;
                continue;
            }

            $item = $row['item'];
            $sticker = Sticker::build(
                self::sanitizeCategory((string) Arr::get($item, 'category', '')),
                mb_substr((string) Arr::get($item, 'category_name', ''), 0, 100),
                mb_substr((string) Arr::get($item, 'title', ''), 0, 100),
                $textToReplace,
                $row['path']
            );

            try {
                $sticker->save();
                $seenInBatch[$textToReplace] = true;
                $paths[] = $row['path'];
                $imported++;
            } catch (QueryException) {
                // Índice UNIQUE: outra requisição gravou o mesmo código entre a
                // checagem e o save. Conta como pulado.
                $skipped++;
            }
        }

        return [
            'response' => new JsonResponse([
                'status'   => 'ok',
                'imported' => $imported,
                'skipped'  => $skipped,
                'total'    => $imported + $skipped,
            ], 200),
            'paths' => $paths,
        ];
    }

    /**
     * Mesma conversão do `sanitizeCategoryCode()` do admin: o código da
     * categoria só aceita `[a-z0-9_]`, e um valor fora disso nunca podia ser
     * reordenado nem salvo de novo pelo modal.
     */
    public static function sanitizeCategory(string $raw): string
    {
        $code = preg_replace('/[^a-z0-9]+/', '_', strtolower(Str::ascii($raw))) ?? '';

        return mb_substr(trim($code, '_'), 0, 100);
    }

    private function isValidStickerPath(string $path): bool
    {
        if (preg_match(StickerFiles::LOCAL_PATH, $path)) {
            return true;
        }

        if (preg_match('#^https?://#i', $path)) {
            return filter_var($path, FILTER_VALIDATE_URL) !== false && mb_strlen($path) <= 500;
        }

        return false;
    }

    private function mimeMatches(string $content, string $extension): bool
    {
        $allowed = UploadStickerController::ALLOWED[$extension] ?? null;
        if ($allowed === null) {
            return false;
        }

        $detected = null;
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detected = finfo_buffer($finfo, $content) ?: null;
                finfo_close($finfo);
            }
        }

        if ($detected === null) {
            return false; // sem como validar: recusa
        }

        return in_array(strtolower($detected), $allowed, true);
    }
}
