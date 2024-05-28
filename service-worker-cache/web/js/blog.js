(function Blog() {
    "use strict";

    var offlineIcon;
    var isOnline = "onLine" in navigator && navigator.onLine;
    var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");

    // Detetar se estamos a usar service workers a partir do navigator
    var usingSW = "serviceWorker" in navigator;

    // Registo do service worker
    var swRegistration;

    // Service worker
    var svcWorker;

    document.addEventListener("DOMContentLoaded", ready, false);

    // Init service worker
    initServiceWorker().catch(console.error);

    // **********************************

    function ready() {
        // Icone que mostra que estamos offline. Usamos o navigator do browser para perceber se estamos online
        offlineIcon = document.getElementById("connectivity-status");

        if (!isOnline) {
            offlineIcon.classList.remove("hidden");
        }

        // Adicionamos os eventos para quando estamos online ou offline remover ou adicioncar o icone.
        window.addEventListener(
            "online",
            function online() {
                offlineIcon.classList.add("hidden");
                isOnline = true;
                sendStatusUpdate();
            },
            false
        );

        window.addEventListener(
            "offline",
            function offline() {
                offlineIcon.classList.remove("hidden");
                isOnline = false;
            },
            false
        );
    }

    // Inicialização do service worker
    async function initServiceWorker() {
        swRegistration = await navigator.serviceWorker.register("/sw.js", {
            updateViaCache: "none",
        });

        // Temos aqui os 3 estados do service worker que precisamos para a inicialização do mesmo
        // Instalação quer dizer que esta é a primeira vez que o service worker foi carregado
        // Apenas podemos ter um service worker activo num dado momento, então como lidamos com uma atualização nele?
        // Então quando fazemos uma pequena alteração no primeiro service worker, uma segunda instância dele é criada.
        // Esta instância tem as novas alterações e fica no estado installing, depois no waiting.
        // Fica à espera então que a primeira instância termine, até depois passar ao estado active.
        // A primeira instância não é considerada terminada até que o tempo de vida da página que estava a servir não tenha expirado.
        // Por exemplo temos de ter um evento de navegação para outra página para que o tempo de vida da página expire, refresh não basta.
        // Mas isto não é uma boa UX, então temos a possibilidade de dizer ao service worker para pular a fase de waiting.
        svcWorker = swRegistration.installing || swRegistration.waiting || swRegistration.active;

        // Devemos ainda aqui enviar a atualização do status quando o mesmo é inicializado.
        sendStatusUpdate(svcWorker);

        // Este event é lançado quando outro service worker se torna o controlador da página atual
        // Ou seja este evento é lançado quando instalamos ou atualizamos o service worker e ainda quando mudamos de página.
        // Devemos ainda aqui enviar a atualização do status para o worker quando existe uma alteração no controller.
        navigator.serviceWorker.addEventListener("controllerchange", function onController() {
            svcWorker = navigator.serviceWorker.controller;
            sendStatusUpdate(svcWorker);
        });

        navigator.serviceWorker.controller.addEventListener("message", onSWMessage);
    }

    // No caso em que a página morreu e o service worker voltou à vida precisamos de avisar o mesmo do estado da aplicação.
    // Neste caso é se está online e se o user está logado.
    function sendStatusUpdate(target) {
        sendSWMessage({ statusUpdate: { isOnline, isLoggedIn } }, target);
    }

    function onSWMessage(evt) {
        var { data } = evt;

        if (data.requestStatusUpdate) {
            console.log("Received status update request from service worker, responding...");
            // Neste caso não é o service worker para onde enviamos, mas sim o canal de mensagens que vai existir neste porto
            sendStatusUpdate(evt.ports && evt.ports[0]);
        }
    }

    function sendSWMessage(msg, target) {
        if (target) {
            target.postMessage(msg);
        } else if (svcWorker) {
            svcWorker.postMessage(msg);
        } else {
            navigator.serviceWorker.controller.postMessage(msg);
        }
    }
})();
