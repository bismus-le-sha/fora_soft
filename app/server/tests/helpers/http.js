/**
 * Общий кусок сетапа для тестов, поднимающих `net.Server`/`http.Server` на
 * эфемерном порту (`listen(0, ...)`) и ожидающих готовый базовый URL — этот
 * фрагмент был буквально продублирован в нескольких `start*`-хелперах
 * (`tests/index.test.js` `startApp`, `tests/socket/gateway.test.js`
 * `startGateway`). Сами обёртки вокруг `createApp`/`createGateway` НЕ
 * унифицируются — это разные по форме объекты (Express-приложение поверх
 * голого `http.Server` vs Socket.io-сервер), унификация была бы избыточной
 * абстракцией; общий (и единственно идентичный) кусок — именно листенинг на
 * эфемерном порту и сборка `http://<host>:<port>` URL.
 */

/**
 * Запускает переданный сервер на эфемерном порту и резолвит порт/URL, когда
 * сервер начал слушать.
 *
 * @param {import('node:http').Server} server
 * @param {string} [host] — если передан, сервер слушает именно на этом хосте
 *   (и он же используется в собранном URL); если не передан — сервер слушает
 *   без явного хоста (как раньше в `socket/gateway.test.js`), а в URL
 *   используется `'localhost'`.
 * @returns {Promise<{port: number, url: string}>}
 */
export function listenEphemeral(server, host) {
  return new Promise((resolve) => {
    const onListening = () => {
      const { port } = server.address();
      resolve({ port, url: `http://${host || 'localhost'}:${port}` });
    };

    if (host) {
      server.listen(0, host, onListening);
    } else {
      server.listen(0, onListening);
    }
  });
}
