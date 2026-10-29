<?php

/*
 * This file is part of ramon/stickers.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Stickers\Tests\unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * Paridade das traduções: toda chave do en.yml existe em cada idioma, e vice-versa.
 *
 * Uma chave esquecida num idioma aparece crua (ou em inglês) para quem usa o
 * outro, e o build do JS não acusa isso. O en.yml é a referência.
 */
final class LocaleParityTest extends TestCase
{
    private const LOCALES = ['en', 'pt-BR'];

    /** @return array<string, array{string}> idiomas comparados com o en */
    public static function translations(): array
    {
        $out = [];

        foreach (self::LOCALES as $locale) {
            if ($locale !== 'en') {
                $out[$locale] = [$locale];
            }
        }

        return $out;
    }

    /** @return array<string, string> chave pontuada => texto, de todas as folhas */
    private function entriesOf(string $locale): array
    {
        return $this->flatten((array) Yaml::parseFile(dirname(__DIR__, 2)."/locale/$locale.yml"));
    }

    /** @return list<string> chaves pontuadas de todas as folhas, em ordem */
    private function keysOf(string $locale): array
    {
        $keys = array_keys($this->entriesOf($locale));
        sort($keys);

        return $keys;
    }

    /**
     * @param  array<array-key, mixed> $data
     * @return array<string, string>
     */
    private function flatten(array $data, string $prefix = ''): array
    {
        $entries = [];

        foreach ($data as $key => $value) {
            $dotted = $prefix === '' ? (string) $key : "$prefix.$key";

            if (is_array($value)) {
                $entries += $this->flatten($value, $dotted);
            } else {
                $entries[$dotted] = (string) $value;
            }
        }

        return $entries;
    }

    /**
     * Variáveis (`{name}`, `{count, plural…`) e tags (`<a>`) de um texto.
     *
     * O tradutor reescreve a frase, mas um placeholder trocado some na tela (ou
     * quebra o ICU). Os ramos do plural (`one {…}`) podem variar entre idiomas.
     *
     * @return list<string>
     */
    private function placeholdersOf(string $text): array
    {
        // o texto dos ramos ("one {…}", "=0 {…}") é traduzido: não conta como variável
        $text = (string) preg_replace('/(?:\b(?:zero|one|two|few|many|other)|=\d+)\s*\{/', '(', $text);
        // só o nome conta: "{count}" no en e "{count, plural…}" noutro idioma valem igual
        preg_match_all('/\{\s*([A-Za-z_]\w*)\s*[,}]|<(\/?(?:a|b|i|em|strong|code|kbd|br|span))\b/', $text, $m);
        $tokens = array_values(array_unique(array_map(static fn (string $var, string $tag): string => $var !== '' ? '{'.$var : '<'.$tag, $m[1], $m[2])));
        sort($tokens);

        return $tokens;
    }

    #[DataProvider('translations')]
    public function test_traduz_todas_as_chaves_do_en(string $locale): void
    {
        $missing = array_values(array_diff($this->keysOf('en'), $this->keysOf($locale)));

        self::assertSame([], $missing, "Faltam em $locale.yml:\n  - ".implode("\n  - ", $missing));
    }

    #[DataProvider('translations')]
    public function test_nao_tem_chaves_ausentes_do_en(string $locale): void
    {
        $extra = array_values(array_diff($this->keysOf($locale), $this->keysOf('en')));

        self::assertSame([], $extra, "Sobram em $locale.yml (faltam em en.yml):\n  - ".implode("\n  - ", $extra));
    }

    #[DataProvider('translations')]
    public function test_placeholders_iguais_aos_do_en(string $locale): void
    {
        $en = $this->entriesOf('en');
        $diff = [];

        foreach ($this->entriesOf($locale) as $key => $text) {
            if (isset($en[$key]) && $this->placeholdersOf($en[$key]) !== $this->placeholdersOf($text)) {
                $diff[] = $key;
            }
        }

        self::assertSame([], $diff, "Placeholders diferentes do en em $locale.yml:\n  - ".implode("\n  - ", $diff));
    }

    public function test_todos_os_idiomas_sao_lidos(): void
    {
        foreach (self::LOCALES as $locale) {
            self::assertNotEmpty($this->keysOf($locale), "$locale.yml não tem nenhuma chave");
        }
    }
}
