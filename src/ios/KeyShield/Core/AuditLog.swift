import Foundation

struct AuditEvent: Codable {
    enum Actor: Codable { case human, agent(UUID) }
    enum Action: String, Codable { case create, save, rotate, delete, copy, reveal, providerRequest, agentToken, backup, restore, lock }
    enum Outcome: String, Codable { case success, denied, failure }
    let id: UUID
    let time: Date
    let actor: Actor
    let action: Action
    let keyId: UUID?
    let outcome: Outcome
    let correlationId: UUID
}

final class AuditLog {
    private let clock: Clock
    private let key: () throws -> Data
    private let url: URL
    private let archiveFile: (URL, URL) throws -> Void
    init(clock: Clock = SystemClock(), url: URL,
         archiveFile: @escaping (URL, URL) throws -> Void = { try FileManager.default.moveItem(at: $0, to: $1) },
         key: @escaping () throws -> Data) {
        self.clock = clock; self.url = url; self.key = key; self.archiveFile = archiveFile
    }
    func append(actor: AuditEvent.Actor, action: AuditEvent.Action, keyId: UUID? = nil, outcome: AuditEvent.Outcome, correlationId: UUID = UUID()) throws {
        do {
            let event = AuditEvent(id: UUID(), time: clock.now, actor: actor, action: action, keyId: keyId, outcome: outcome, correlationId: correlationId)
            let ciphertext = try Cipher.seal(JSONEncoder().encode(event), key: key())
            var data = FileManager.default.fileExists(atPath: url.path) ? try Data(contentsOf: url) : Data()
            data.append(Data((ciphertext.base64EncodedString() + "\n").utf8))
            try Cipher.write(data, to: url)
        } catch { throw ShieldError.audit }
    }
    func events() throws -> [AuditEvent] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try String(decoding: Data(contentsOf: url), as: UTF8.self).split(separator: "\n").map {
            guard let data = Data(base64Encoded: String($0)) else { throw ShieldError.audit }
            return try JSONDecoder().decode(AuditEvent.self, from: Cipher.open(data, key: key()))
        }
    }
    func archiveUnreadableLog() throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let archive = url.appendingPathExtension("unreadable-" + UUID().uuidString)
        do { try archiveFile(url, archive) }
        catch { throw ShieldError.audit }
    }
}
