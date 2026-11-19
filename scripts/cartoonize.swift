// Cuts the person at a chosen point out of a photo (Apple Vision subject
// masks) and gives it a painted, illustrated look with Core Image, so photos
// can sit alongside the illustrated loading characters.
//
// Usage: swift scripts/cartoonize.swift <input.jpg> <output.png> <x> <y> [style]
//   x, y   – a point on the person, as fractions of the photo (0–1, from top-left)
//   style  – smoothing strength, default 1.0
import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision

let args = CommandLine.arguments
guard args.count >= 5,
      let x = Double(args[3]), let y = Double(args[4]) else {
    print("usage: cartoonize <input> <output> <x> <y> [style]")
    exit(1)
}
let strength = args.count > 5 ? Double(args[5]) ?? 1 : 1
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])

guard let source = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
    print("cannot read \(inputURL.path)"); exit(1)
}
let context = CIContext()
let cgSource = context.createCGImage(source, from: source.extent)!

// 1. Subject mask: pick the instance under the given point.
let handler = VNImageRequestHandler(cgImage: cgSource)
let request = VNGeneratePersonInstanceMaskRequest()
try handler.perform([request])
guard let observation = request.results?.first else { print("no person found"); exit(1) }

let maskMap = observation.instanceMask
CVPixelBufferLockBaseAddress(maskMap, .readOnly)
let mw = CVPixelBufferGetWidth(maskMap), mh = CVPixelBufferGetHeight(maskMap)
let rowBytes = CVPixelBufferGetBytesPerRow(maskMap)
let base = CVPixelBufferGetBaseAddress(maskMap)!.assumingMemoryBound(to: UInt8.self)
let px = min(mw - 1, Int(x * Double(mw))), py = min(mh - 1, Int(y * Double(mh)))
var instance = Int(base[py * rowBytes + px])
CVPixelBufferUnlockBaseAddress(maskMap, .readOnly)
if instance == 0 {
    // Point missed; fall back to the largest instance.
    instance = observation.allInstances.first ?? 1
    print("point not on a subject, using instance \(instance)")
}
let maskBuffer = try observation.generateScaledMaskForImage(forInstances: [instance], from: handler)
var mask = CIImage(cvPixelBuffer: maskBuffer)
mask = mask.transformed(by: CGAffineTransform(
    scaleX: source.extent.width / mask.extent.width,
    y: source.extent.height / mask.extent.height))

// 2. Painted look: soften skin/fabric texture while keeping faces faithful,
// then warm, saturated colour like the illustrations.
var painted = source
let median = CIFilter.median()
for _ in 0..<Int(2 * strength) {
    median.inputImage = painted
    painted = median.outputImage!
}
let noise = CIFilter.noiseReduction()
noise.inputImage = painted
noise.noiseLevel = Float(0.04 * strength)
noise.sharpness = 0.5
painted = noise.outputImage!

let colour = CIFilter.colorControls()
colour.inputImage = painted
colour.saturation = 1.18
colour.contrast = 1.05
colour.brightness = 0.015
painted = colour.outputImage!

let vibrance = CIFilter.vibrance()
vibrance.inputImage = painted
vibrance.amount = 0.3
painted = vibrance.outputImage!

let sharpen = CIFilter.unsharpMask()
sharpen.inputImage = painted
sharpen.radius = Float(source.extent.height / 700)
sharpen.intensity = 0.5
painted = sharpen.outputImage!.cropped(to: source.extent)

// style 0 = plain cut-out (used as the photo input for scripts/face-likeness.mjs).
if strength == 0 { painted = source }

// Clean silhouette edge (slight choke + feather).
let choke = CIFilter.morphologyMinimum()
choke.inputImage = mask
choke.radius = Float(max(1, source.extent.height / 900))
let feather = CIFilter.gaussianBlur()
feather.inputImage = choke.outputImage!.clampedToExtent()
feather.radius = Float(max(1, source.extent.height / 1200))
let alpha = feather.outputImage!.cropped(to: source.extent)

let cutout = CIFilter.blendWithMask()
cutout.inputImage = painted
cutout.backgroundImage = CIImage.empty()
cutout.maskImage = alpha
var result = cutout.outputImage!.cropped(to: source.extent)

if strength > 0 {
// Thin warm-brown outline around the silhouette, like an inked illustration.
let grow = CIFilter.morphologyMaximum()
grow.inputImage = alpha
grow.radius = Float(max(1.5, source.extent.height / 500))
let outlineColour = CIImage(color: CIColor(red: 0.29, green: 0.16, blue: 0.12, alpha: 0.85)).cropped(to: source.extent)
let outline = CIFilter.blendWithMask()
outline.inputImage = outlineColour
outline.backgroundImage = CIImage.empty()
outline.maskImage = grow.outputImage!.cropped(to: source.extent)
result = result.composited(over: outline.outputImage!.cropped(to: source.extent))
}

guard let cgResult = context.createCGImage(result, from: source.extent) else { exit(1) }
let rep = NSBitmapImageRep(cgImage: cgResult)
try rep.representation(using: .png, properties: [:])!.write(to: outputURL)
print("wrote \(outputURL.path)")
