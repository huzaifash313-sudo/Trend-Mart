const fs = require("fs");
const src = "C:/Users/HAFIZ/.cursor/projects/c-Users-HAFIZ-Desktop-trendmart/assets/c__Users_HAFIZ_AppData_Roaming_Cursor_User_workspaceStorage_5bb48e232452bf181c9bb410394d0a15_images_image-abe4f1fb-f9d9-4b3b-af83-2760a5a37a23.png";
const dst = "C:/Users/HAFIZ/Desktop/trendmart/public/_ref_color.jpg";
fs.copyFileSync(src, dst);
console.log("copied", fs.statSync(dst).size);
