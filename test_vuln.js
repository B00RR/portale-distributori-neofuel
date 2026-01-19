// TEST VULNERABILITY FILE
const x = "alert(1)";
eval(x); // Should trigger security/detect-eval-with-expression
document.body.innerHTML = x; // Should trigger no-unsanitized/property
