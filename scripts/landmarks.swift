// Prints the 2D face landmarks Apple Vision finds for the largest face in an
// image, as JSON pixel coordinates with a top-left origin:
// {"width":W,"height":H,"points":[[x,y],...]}
// The point order is Vision's fixed 76-point constellation, so the same index
// means the same facial feature in any two images. Used by face-likeness.mjs.
//
// Usage: swift scripts/landmarks.swift <image>
import AppKit
import Vision

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{}"); exit(1)
}
let size = CGSize(width: cg.width, height: cg.height)
let request = VNDetectFaceLandmarksRequest()
request.constellation = .constellation76Points
try VNImageRequestHandler(cgImage: cg).perform([request])
guard let face = (request.results ?? []).max(by: {
    $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
}), let all = face.landmarks?.allPoints else {
    print("{}"); exit(1)
}
let points = all.pointsInImage(imageSize: size).map {
    String(format: "[%.2f,%.2f]", $0.x, size.height - $0.y)
}
print("{\"width\":\(cg.width),\"height\":\(cg.height),\"points\":[\(points.joined(separator: ","))]}")
