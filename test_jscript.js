
try {
    // Read and eval the app.js code inside a function wrapper to check syntax
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var file = fso.OpenTextFile("frontend/js/app.js", 1);
    var code = file.ReadAll();
    file.Close();
    // Test compile
    new Function(code);
    WScript.Echo("SYNTAX OK");
} catch(e) {
    WScript.Echo("SYNTAX ERROR: " + e.name + " - " + e.message + " (number: " + (e.number & 0xFFFF) + ")");
}
