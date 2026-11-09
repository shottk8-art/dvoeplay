import UIKit
import WebKit

/// Сборник на весь экран: страницы из папки site (копия public/, ios/build.py) по адресу dvoeplay-app://local/…
/// Своя схема, а не file://, — чтобы страницы были одним сайтом: общая память dvoeplay:v1 в localStorage, переходы
/// между играми и относительный адрес сервера /api/…, который приложение пересылает на сайт сборника (сетевая игра).
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let scheme = "dvoeplay-app"
    private var web: WKWebView!
    private let site = SiteHandler()

    /// фон до загрузки страницы — как у сборника: светлый #F2F2F7 / тёмный #1C1C1E
    private let background = UIColor(named: "LaunchBackground") ?? .systemGroupedBackground

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(site, forURLScheme: Self.scheme)
        config.websiteDataStore = .default()                   // localStorage живёт между запусками
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.dataDetectorTypes = []
        #if DEBUG
        // для проверок: код из переменной DVOE_DEBUG_JS выполняется до страницы (например, задаёт память в localStorage).
        // Запуск: SIMCTL_CHILD_DVOE_DEBUG_JS='…' xcrun simctl launch <устройство> ru.dvoeplay.games
        if let debugJS = ProcessInfo.processInfo.environment["DVOE_DEBUG_JS"], !debugJS.isEmpty {
            config.userContentController.addUserScript(WKUserScript(source: debugJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = background
        web.scrollView.backgroundColor = background
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never   // отступы выреза страницы берут сами из env(safe-area-inset-*)
        web.allowsBackForwardNavigationGestures = true            // свайп от левого края — назад, как «‹» в играх
        web.allowsLinkPreview = false
        web.navigationDelegate = self
        web.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }  // отладка страницы через Safari → Разработка
        #endif
        self.web = web
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: URL(string: "\(Self.scheme)://local/index.html")!))
    }

    // MARK: ссылки наружу — в Safari, свои страницы — здесь

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        if scheme == Self.scheme || scheme == "about" || scheme == "blob" || scheme == "data" {
            return decisionHandler(.allow)
        }
        if action.targetFrame?.isMainFrame != false { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    /// target="_blank" и window.open — тоже наружу
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.scheme?.lowercased() == Self.scheme { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    /// страница упала (например, iOS выгрузила её из памяти в фоне) — открываем заново
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

/// Отдаёт файлы из папки site, а запросы /api/… пересылает на сайт сборника и возвращает ответ странице как есть.
final class SiteHandler: NSObject, WKURLSchemeHandler {
    static let server = URL(string: "https://dvoeplay.netlify.app")!
    private let root = Bundle.main.url(forResource: "site", withExtension: nil)!
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 15
        return URLSession(configuration: c)
    }()
    /// задачи, которые страница уже отменила: отвечать на них нельзя (WebKit падает)
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        if url.path.hasPrefix("/api/") { proxy(task, url: url) } else { serveFile(task, url: url) }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private func serveFile(_ task: WKURLSchemeTask, url: URL) {
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            return finish(task, url: url, status: 404, type: "text/plain; charset=utf-8", data: Data("Not found".utf8))
        }
        finish(task, url: url, status: 200, type: Self.mime(file.pathExtension), data: data)
    }

    private func proxy(_ task: WKURLSchemeTask, url: URL) {
        var parts = URLComponents(url: Self.server, resolvingAgainstBaseURL: false)!
        parts.path = url.path
        parts.query = url.query
        var request = URLRequest(url: parts.url!)
        request.httpMethod = task.request.httpMethod ?? "GET"
        request.httpBody = task.request.httpBody ?? task.request.httpBodyStream.map(Self.read)
        for (key, value) in task.request.allHTTPHeaderFields ?? [:] where key.lowercased() != "origin" {
            request.setValue(value, forHTTPHeaderField: key)
        }
        session.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let http = response as? HTTPURLResponse else {
                    // нет связи: пустой ответ с ошибкой — net.js покажет «Нет связи с сервером» и повторит опрос
                    return self.fail(task)
                }
                self.finish(task, url: url, status: http.statusCode,
                            type: http.value(forHTTPHeaderField: "Content-Type") ?? "application/json", data: data ?? Data())
            }
        }.resume()
    }

    private func finish(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        if stopped.remove(ObjectIdentifier(task)) != nil { return }
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store"]
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func fail(_ task: WKURLSchemeTask) {
        if stopped.remove(ObjectIdentifier(task)) != nil { return }
        task.didFailWithError(URLError(.notConnectedToInternet))
    }

    private static func read(_ stream: InputStream) -> Data {
        var data = Data()
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 16384)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }

    private static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        default: return "application/octet-stream"
        }
    }
}
