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
const version = 2;
var isOnline = true;
var isLoggedIn = false;

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);

async function main() {
    await sendMessage({ requestStatusUpdate: true });
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
    // Portanto usamos o clients.claim(), que é um método que permite colocar o service worker como controller de todos os clientes no seu escopo.
    // O que acaba por fazer é trigger ao evento controllerchange no navigator.serviceWorker em qualquer cliente controlado por este service worker.
    // Quando o service worker foi registado inicialmente as páginas não o usam até ao seu próximo load.
    // O método claim() causa que essas páginas passem a ser controladas pelo service worker.
    // Assim todos os clientes que o usam começam a usar a nova versão do service worker a interceptar pedidos sem o user ter de fazer reload à página
    clients.claim();
    console.log(`Service Worker (${version}) activated.`);
}
