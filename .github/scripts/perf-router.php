<?php

/**
 * Router para o servidor embutido do PHP (`php -S ... -t public router.php`) no
 * benchmark de performance. Serve arquivos reais de public/ (assets) e roteia
 * todo o resto para o front controller public/index.php. Sem isso o servidor
 * embutido devolve 404 em rotas SPA (/, /all, /u/admin), porque não tem
 * fallback para o index.
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_contains($uri, '..') || str_contains($uri, "\0")) {
    http_response_code(400);
    return;
}

if ($uri !== '/' && is_file(__DIR__ . '/public' . $uri)) {
    return false; // deixa o servidor embutido servir o asset estático de public/
}

// O index.php do Flarum faz `require '../site.php'` relativo ao diretório de
// trabalho. Num docroot real o cwd é public/; aqui o router roda a partir da
// raiz, então entramos em public/ antes de incluir o front controller — senão
// o require de site.php falha com 500.
chdir(__DIR__ . '/public');
require __DIR__ . '/public/index.php';
