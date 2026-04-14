<?php

namespace Ramon\Stickers\Api\Controller;

use Flarum\Foundation\Paths;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Stickers\Models\Sticker;

class ImportStickersController implements RequestHandlerInterface
{
    public function __construct(
        protected Paths $paths
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();

        // ZIP import — contains stickers.json + actual files
        if (! empty($uploadedFiles['file'])) {
            return $this->handleZipImport($uploadedFiles['file']);
        }

        // Legacy JSON import — only metadata, no files
        $data = Arr::get($request->getParsedBody(), 'data', []);

        return $this->importData($data);
    }

    // -------------------------------------------------------------------------

    private function handleZipImport($uploadedFile): ResponseInterface
    {
        if ($uploadedFile->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['error' => 'Upload error: ' . $uploadedFile->getError()], 400);
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'stickers_import_');
        $uploadedFile->moveTo($tmpFile);

        $zip = new \ZipArchive();

        if ($zip->open($tmpFile) !== true) {
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'Invalid ZIP file'], 400);
        }

        $metadataJson = $zip->getFromName('stickers.json');

        if ($metadataJson === false) {
            $zip->close();
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'stickers.json not found inside the ZIP'], 400);
        }

        $metadata = json_decode($metadataJson, true);

        if (! is_array($metadata)) {
            $zip->close();
            @unlink($tmpFile);
            return new JsonResponse(['error' => 'stickers.json contains invalid JSON'], 400);
        }

        // Ensure the stickers directory exists
        $dir = $this->paths->public . '/assets/stickers/';
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Extract sticker files from the ZIP
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);

            if (str_starts_with($entryName, 'files/') && $entryName !== 'files/') {
                $content  = $zip->getFromIndex($i);
                $basename = basename($entryName);
                // Avoid collisions by checking if the file already exists
                $dest = $dir . $basename;
                if (! file_exists($dest)) {
                    file_put_contents($dest, $content);
                }
            }
        }

        $zip->close();
        @unlink($tmpFile);

        // Rewrite paths so they point to the newly extracted files
        foreach ($metadata as &$item) {
            if (! empty($item['file'])) {
                $item['path'] = '/assets/stickers/' . basename($item['file']);
                unset($item['file']);
            }
        }
        unset($item);

        return $this->importData($metadata);
    }

    private function importData(array $data): ResponseInterface
    {
        $imported = 0;
        $skipped  = 0;

        foreach ($data as $item) {
            $textToReplace = Arr::get($item, 'text_to_replace', '');

            // Skip duplicates: if a sticker with the same text_to_replace already exists, do not insert
            if ($textToReplace !== '' && Sticker::where('text_to_replace', $textToReplace)->exists()) {
                $skipped++;
                continue;
            }

            $sticker = Sticker::build(
                Arr::get($item, 'category', ''),
                Arr::get($item, 'category_name', ''),
                Arr::get($item, 'title', ''),
                $textToReplace,
                Arr::get($item, 'path', '')
            );

            $sticker->save();
            $imported++;
        }

        return new JsonResponse([
            'status'   => 'ok',
            'imported' => $imported,
            'skipped'  => $skipped,
            'total'    => $imported + $skipped,
        ], 200);
    }
}
