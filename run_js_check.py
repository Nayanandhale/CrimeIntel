import sys
import re

with open('frontend/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's use Python's built-in or a simple lexer to find unclosed tokens
# Even better: let's use Windows Script Host (cscript) which is BUILT INTO ALL WINDOWS OS!
# Windows has cscript / wscript which runs JScript (JavaScript) natively!
with open('test_jscript.js', 'w', encoding='utf-8') as f:
    f.write("""
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
""")

print("Created test_jscript.js")
