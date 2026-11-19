import Foundation

struct ProviderResponse {
    let status: Int
    let headers: [String: String]
    let body: Data
}

struct AgentProviderResult: Codable {
    let status: Int
    let outcome: AuditEvent.Outcome
    let byteCount: Int
    let correlationId: UUID
}

struct MockProviderTransport {
    private let handler: (URLRequest) throws -> ProviderResponse
    init(handler: @escaping (URLRequest) throws -> ProviderResponse = { _ in
        ProviderResponse(status: 200, headers: [:], body: Data("Simulated provider response".utf8))
    }) {
        self.handler = handler
    }
    func send(_ request: URLRequest) throws -> ProviderResponse {
        guard request.url?.host == "api.provider.test", request.url?.scheme == "https",
              request.url?.port == nil, request.url?.user == nil, request.url?.password == nil else { throw ShieldError.denied }
        return try handler(request)
    }
}

final class ProviderRequestExecutor {
    private let transport: MockProviderTransport
    private let vault: VaultStore
    private let audit: AuditLog
    init(vault: VaultStore, audit: AuditLog, transport: MockProviderTransport = MockProviderTransport()) {
        self.vault = vault; self.audit = audit; self.transport = transport
    }
    func execute(token: String, keyId: UUID, method: String, url: URL, body: Data? = nil) async throws -> AgentProviderResult {
        let metadata = try vault.sessions.validate(token, method: method, url: url, keyId: keyId)
        try validateMockURL(url)
        let secret = try vault.withProviderSecret(keyId, token: token, method: method, url: url) { $0 }
        let correlationId = UUID()
        let response = try send(secret: secret, keyId: keyId, actor: .agent(metadata.id), method: method, url: url, body: body, correlationId: correlationId)
        return AgentProviderResult(status: response.status, outcome: .success, byteCount: response.body.count, correlationId: correlationId)
    }
    func execute(operation: Operation, authorization: Authorization) async throws -> ProviderResponse {
        guard operation.kind == .providerRequest, let host = operation.host,
              let method = operation.method, !method.isEmpty, let path = operation.path, path.hasPrefix("/"),
              vault.sessions.isApprovedHost(host),
              let url = URL(string: "https://" + host + path), url.host == host, url.path == path else { throw ShieldError.denied }
        try validateMockURL(url)
        let secret = try vault.withSecret(operation.keyId, authorization: authorization, operation: operation) { $0 }
        return try send(secret: secret, keyId: operation.keyId, actor: .human, method: method, url: url, body: nil, correlationId: UUID())
    }
    private func validateMockURL(_ url: URL) throws {
        guard url.host == "api.provider.test", url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil, url.query == nil, url.fragment == nil else { throw ShieldError.denied }
    }
    private func send(secret: String, keyId: UUID, actor: AuditEvent.Actor, method: String, url: URL, body: Data?, correlationId: UUID) throws -> ProviderResponse {
        try validateMockURL(url)
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body
        request.setValue("Bearer " + secret, forHTTPHeaderField: "Authorization")
        let response: ProviderResponse
        do { response = try transport.send(request) }
        catch {
            try audit.append(actor: actor, action: .providerRequest, keyId: keyId, outcome: .failure, correlationId: correlationId)
            throw ShieldError.network
        }
        guard !(300..<400).contains(response.status) else {
            try audit.append(actor: actor, action: .providerRequest, keyId: keyId, outcome: .failure, correlationId: correlationId)
            throw ShieldError.denied
        }
        let raw = Data(secret.utf8)
        let forms = [secret, raw.base64EncodedString(), raw.map { String(format: "%02x", $0) }.joined(), raw.map { String(format: "%02X", $0) }.joined()]
        func redact(_ value: String) -> String { forms.reduce(value) { $0.replacingOccurrences(of: $1, with: "[REDACTED]") } }
        let headers = response.headers.reduce(into: [String: String]()) { result, pair in
            result[redact(pair.key)] = redact(pair.value)
        }
        let safeBody: Data
        if let text = String(data: response.body, encoding: .utf8) { safeBody = Data(redact(text).utf8) }
        else { safeBody = Data("[REDACTED BINARY RESPONSE]".utf8) }
        try audit.append(actor: actor, action: .providerRequest, keyId: keyId, outcome: .success, correlationId: correlationId)
        return ProviderResponse(status: response.status, headers: headers, body: safeBody)
    }
}
