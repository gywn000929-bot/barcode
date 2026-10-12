const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
http
  .createServer((req, res) => {
    let file = path.join(__dirname, "..", "파렛트_바코드_누적_4.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(file));
  })
  .listen(8765, "127.0.0.1");
