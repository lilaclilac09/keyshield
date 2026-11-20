import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let ios = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let assets = ios.appendingPathComponent("KeyShield/Assets.xcassets")
let output = assets.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let slots: [(String, String, Int)] = [
    ("iphone", "20x20", 2), ("iphone", "20x20", 3),
    ("iphone", "29x29", 2), ("iphone", "29x29", 3),
    ("iphone", "40x40", 2), ("iphone", "40x40", 3),
    ("iphone", "60x60", 2), ("iphone", "60x60", 3),
    ("ipad", "20x20", 1), ("ipad", "20x20", 2),
    ("ipad", "29x29", 1), ("ipad", "29x29", 2),
    ("ipad", "40x40", 1), ("ipad", "40x40", 2),
    ("ipad", "76x76", 1), ("ipad", "76x76", 2),
    ("ipad", "83.5x83.5", 2), ("ios-marketing", "1024x1024", 1)
]
var images: [[String: String]] = []
for (idiom, size, scale) in slots {
    let pixels = Int(Double(size.components(separatedBy: "x")[0])! * Double(scale))
    let filename = "Icon-\(pixels).png"
    images.append(["idiom": idiom, "size": size, "scale": "\(scale)x", "filename": filename])
    let bitmap = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
                           bytesPerRow: pixels * 4, space: CGColorSpaceCreateDeviceRGB(),
                           bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    bitmap.scaleBy(x: CGFloat(pixels) / 1024, y: CGFloat(pixels) / 1024)
    bitmap.setFillColor(red: 0.035, green: 0.06, blue: 0.10, alpha: 1)
    bitmap.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    bitmap.setFillColor(red: 0.35, green: 0.80, blue: 0.69, alpha: 1)
    bitmap.move(to: CGPoint(x: 512, y: 892))
    bitmap.addLine(to: CGPoint(x: 238, y: 800))
    bitmap.addLine(to: CGPoint(x: 238, y: 555))
    bitmap.addCurve(to: CGPoint(x: 512, y: 200), control1: CGPoint(x: 238, y: 370), control2: CGPoint(x: 380, y: 250))
    bitmap.addCurve(to: CGPoint(x: 786, y: 555), control1: CGPoint(x: 644, y: 250), control2: CGPoint(x: 786, y: 370))
    bitmap.addLine(to: CGPoint(x: 786, y: 800))
    bitmap.closePath()
    bitmap.fillPath()
    bitmap.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    bitmap.fillEllipse(in: CGRect(x: 430, y: 528, width: 164, height: 164))
    bitmap.move(to: CGPoint(x: 481, y: 558))
    bitmap.addLine(to: CGPoint(x: 461, y: 405))
    bitmap.addLine(to: CGPoint(x: 563, y: 405))
    bitmap.addLine(to: CGPoint(x: 543, y: 558))
    bitmap.closePath()
    bitmap.fillPath()
    let destination = CGImageDestinationCreateWithURL(output.appendingPathComponent(filename) as CFURL,
                                                      UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, bitmap.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(destination))
}
let info: [String: Any] = ["author": "xcode", "version": 1]
try JSONSerialization.data(withJSONObject: ["info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: assets.appendingPathComponent("Contents.json"))
try JSONSerialization.data(withJSONObject: ["images": images, "info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: output.appendingPathComponent("Contents.json"))
