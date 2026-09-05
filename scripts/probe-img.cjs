// Check real magic bytes of the image, then sample via a tiny decoder if JPEG/PNG.
const fs = require("fs");
const p = "C:/Users/HAFIZ/.cursor/projects/c-Users-HAFIZ-Desktop-trendmart/assets/c__Users_HAFIZ_AppData_Roaming_Cursor_User_workspaceStorage_5bb48e232452bf181c9bb410394d0a15_images_image-abe4f1fb-f9d9-4b3b-af83-2760a5a37a23.png";
const b = fs.readFileSync(p);
const out = [];
out.push("fileLen=" + b.length);
out.push("first16=" + b.slice(0, 16).toString("hex"));
const isPng = b.slice(1, 4).toString() === "PNG";
const isJpeg = b[0] === 0xff && b[1] === 0xd8;
out.push("isPng=" + isPng + " isJpeg=" + isJpeg);
fs.writeFileSync(process.argv[2], out.join("\n"));
console.log("wrote probe");
