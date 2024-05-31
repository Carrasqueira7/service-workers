"use strict";

// Temos aqui os 3 estados do service worker que precisamos para a inicialização do mesmo
// Instalação quer dizer que esta é a primeira vez que o service worker foi carregado
// Apenas podemos ter um service worker activo num dado momento, então como lidamos com uma atualização nele?
// Então quando fazemos uma pequena alteração no primeiro service worker, uma segunda instância dele é criada.
// Esta instância tem as novas alterações e fica no estado installing, depois no waiting.
// Fica à espera então que a primeira instância termine, até depois passar ao estado active.
// A primeira instância não é considerada terminada até que o tempo de vida da página que estava a servir não tenha expirado.
// Por exemplo temos de ter um evento de navegação para outra página para que o tempo de vida da página expire, refresh não basta.
// Mas isto não é uma boa UX, então temos a possibilidade de dizer ao service worker para pular a fase de waiting.

// Assim que chamamos o register no browser, ele começa e corre o service worker, instalando o mesmo.
// Assim fica no estado running o tempo todo em que página esteja "ativa"
// Se formos para uma página diferente e esquecermos da nossa, assim que voltamos ela fica de novo "ativa"
// Com isto o browser deteta e faz restart ao service worker, mas não faz um rerun da instalação e ativação do mesmo

// Valor para nós podermos dizer ao browser que temos código novo no service worker é atualizado. Na realidade basta alterar 1 byte no código
const version = 6;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`;

// Vamso colocar em cache os urls que queremos carregar quandoe estivermos em offline
var urlsToCache = {
    loggedOut: ["", "/about", "/contact", "/404", "/login", "/offline", "/js/blog.js", "/js/home.js", "/js/login.js", "/js/add-post.js", "/css/style.css", "/images/logo.gif", "/images/offline.png"],
};

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);

async function main() {
    await sendMessage({ requestStatusUpdate: true });
    await cacheLoggedOutFiles();
}

main().catch(console.error);

async function onInstall(evt) {
    console.log(`Service Worker (${version}) installed.`);
    self.skipWaiting(); // Com isto forçamos a que qualquer versão nova do service worker vai ficar running neste momento
}

async function sendMessage(msg) {
    var allClients = await clients.matchAll({ includeUncontrolled: true });

    return Promise.all(
        allClients.map(function clientMsg(client) {
            var chan = new MessageChannel();
            chan.port1.onMessage = onMessage;
            return client.postMessage(msg, [chan.port2]);
        })
    );
}

function onMessage({ data }) {
    if (data.statusUpdate) {
        var { isOnline, isLoggedIn } = data.statusUpdate;
        console.log(`Service Worker (v${version}) status update, isOnline: ${isOnline}, isLoggedIn: ${isLoggedIn}`);
    }
}

async function onActivate(evt) {
    // Com este código o browser não vai terminar o service worker até que a Promise passada seja resolvida ou rejeitada
    // Um bom exemplo é quando o user inicia a nossa página e estamos a preencher a cache dele, e de repente ele sai da página.
    // Não queremos deixar a cache parcialmente cheia num estado inconsistente, então corre no background.
    // Claro que se levar imenso tempo a resolver a promessa ou rejeitar o browser pode eventualmente matar o service worker.
    evt.waitUntil(handleActivation());
}

// Podemos ter o cenário em que temos 3 tabs da nossa app aberta, e atualizamos o service worker.
// Apenas aquela que está ativa ia perceber que o service worker tinha sido atualizado.
async function handleActivation() {
    // Quando trabalhamos com cache estamos a usar cache referente à versão do service worker.
    // Quando ativamos uma nova versão do service worker, verificamos que vai ser criada uma nova cache com base na versão do novo service worker
    // Por isso devemos limpar todas as versões antigas da cache
    // Porque não fazemos na instalação? Porque pode haver outro service worker a mexer na cache na mesma altura
    await clearCaches();

    // Aqui é a ativação do nosso service worker, e aqui queremos que a nossa cache seja atualizada com todos os novos valores
    await cacheLoggedOutFiles(true);

    // Portanto usamos o clients.claim(), que é um método que permite colocar o service worker como controller de todos os clientes no seu escopo.
    // O que acaba por fazer é trigger ao evento controllerchange no navigator.serviceWorker em qualquer cliente controlado por este service worker.
    // Quando o service worker foi registado inicialmente as páginas não o usam até ao seu próximo load.
    // O método claim() causa que essas páginas passem a ser controladas pelo service worker.
    // Assim todos os clientes que o usam começam a usar a nova versão do service worker a interceptar pedidos sem o user ter de fazer reload à página
    clients.claim();

    console.log(`Service Worker (${version}) activated.`);
}

// Vamos apenas limpar a cache do nosso service worker, nunca tod aa cache porque podem existir outras aplicações que façam cache na nossa app também
async function clearCaches() {
    var cacheNames = await caches.keys();
    console.log("Current cache names:", cacheNames);

    var oldCacheNames = cacheNames.filter(function matchOldCache(cacheName) {
        if (/^ramblings-\d+$/.test(cacheName)) {
            let [, cacheVersion] = cacheName.match(/^ramblings-(\d+)$/);
            cacheVersion = cacheVersion != null ? Number(cacheVersion) : cacheVersion;

            return cacheVersion > 0 && cacheVersion != version;
        }
    });

    console.log("Caches to delete:", oldCacheNames);

    return Promise.all(
        oldCacheNames.map(function deleteCache(cacheName) {
            return caches.delete(cacheName).then((deleted) => console.log(`Cache ${cacheName} deleted:`, deleted));
        })
    );
}

async function cacheLoggedOutFiles(forceReload = false) {
    var cache = await caches.open(cacheName);

    return Promise.all(
        urlsToCache.loggedOut.map(async function requestFile(url) {
            try {
                let res;

                // Se tivermos alguma coisa na cache, retornamos
                if (!forceReload) {
                    res = await cache.match(url);

                    if (res) {
                        return res;
                    }
                }

                // Se não tivermos o recurso em cache queremos ir buscá-lo.
                // Colocamos aqui no-cache porque não queremos que o browser coloque em cache este resultado
                let fetchOptions = {
                    method: "GET",
                    credentials: "omit",
                    cache: "no-cache",
                };

                res = await fetch(url, fetchOptions);

                if (res.ok) {
                    // Porque usamos um clone da resposta?
                    // Uma resposta deve ser usada para um só propósito, e se colocarmos em cache e retornamos na mesma função vamos ter erros estranhos de headers não fechados. Então devemos sempre colocar um clone da resposta na cache
                    await cache.put(url, res.clone());
                }
            } catch (err) {}
        })
    );
}
