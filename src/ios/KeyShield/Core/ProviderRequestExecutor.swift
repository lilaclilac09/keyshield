import Foundation

struct ProviderResponse {
    let status: Int
    let headers: [String: String]
    let body: Data
}

final class RefuseRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class ProviderRequestExecutor {
    private let session: URLSession
    private let vault: VaultStore
    private let audit: AuditLog
    private let redirects = RefuseRedirects()
    init(vault: VaultStore, audit: AuditLog, session: URLSession? = nil) {
        self.vault = vault; self.audit = audit
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.urlCache = nil
        config.httpCookieStorage = nil
        self.session = session ?? URLSession(configuration: config)
    }
    func execute(token: String, keyId: UUID, method: String, url: URL, body: Data? = nil) async throws -> ProviderResponse {
        let metadata = try vault.sessions.validate(token, method: method, url: url, keyId: keyId)
        let secret = try vault.withProviderSecret(keyId, token: token, method: method, url: url) { $0 }
        return try await send(secret: secret, keyId: keyId, actor: .agent(metadata.id), method: method, url: url, body: body)
    }
    func execute(operation: Operation, authorization: Authorization) async throws -> ProviderResponse {
        guard operation.kind == .providerRequest, let host = operation.host,
              let method = operation.method, !method.isEmpty, let path = operation.path, path.hasPrefix("/"),
              vault.sessions.isApprovedHost(host),
              let url = URL(string: "https://" + host + path), url.host == host, url.path == path,
              url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil else { throw ShieldError.denied }
        let secret = try vault.withSecret(operation.keyId, authorization: authorization, operation: operation) { $0 }
        return try await send(secret: secret, keyId: operation.keyId, actor: .human, method: method, url: url, body: nil)
    }
    private func send(secret: String, keyId: UUID, actor: AuditEvent.Actor, method: String, url: URL, body: Data?) async throws -> ProviderResponse {
        // Synthetic envelopes must never reach a real provider.
        guard url.host?.hasSuffix(".test") == true else { throw ShieldError.denied }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body
        request.setValue("Bearer " + secret, forHTTPHeaderField: "Authorization")
        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: request, delegate: redirects) }
        catch {
            try audit.append(actor: actor, action: .providerRequest, keyId: keyId, outcome: .failure)
            throw ShieldError.network
        }
        guard let http = response as? HTTPURLResponse, !(300..<400).contains(http.statusCode) else { throw ShieldError.denied }
        let raw = Data(secret.utf8)
        let forms = [secret, raw.base64EncodedString(), raw.map { String(format: "%02x", $0) }.joined(), raw.map { String(format: "%02X", $0) }.joined()]
        func redact(_ value: String) -> String { forms.reduce(value) { $0.replacingOccurrences(of: $1, with: "[REDACTED]") } }
        let headers = http.allHeaderFields.reduce(into: [String: String]()) { result, pair in
            result[redact(String(describing: pair.key))] = redact(String(describing: pair.value))
        }
        let safeBody: Data
        if let text = String(data: data, encoding: .utf8) { safeBody = Data(redact(text).utf8) }
        else { safeBody = Data("[REDACTED BINARY RESPONSE]".utf8) }
        try audit.append(actor: actor, action: .providerRequest, keyId: keyId, outcome: .success)
        return ProviderResponse(status: http.statusCode, headers: headers, body: safeBody)
    }
}
