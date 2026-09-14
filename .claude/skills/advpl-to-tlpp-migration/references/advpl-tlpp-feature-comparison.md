# AdvPL vs. TLPP Feature Comparison

| Feature                                                     | AdvPL             | TLPP           | Migration Notes                    |
| ----------------------------------------------------------- | ----------------- | -------------- | ---------------------------------- |
| Variable scoping (Local, Private, Public, Static)           | Yes               | Yes            | No change needed                   |
| Function scoping (User Function, Static Function) | Yes               | Yes            | Customizações **DEVEM** usar `User Function` para rotinas públicas e `Static Function` para auxiliares. **Nunca use `Function`** — reservado ao produto padrão |
| Control structures (If, While, For, Case)                   | Yes               | Yes            | No change needed                   |
| Code blocks                                                 | Yes               | Yes            | No change needed                   |
| Macro execution (`&cExpr`)                                  | Yes               | Yes            | Consider safer alternatives        |
| Database access (Workarea, Embedded SQL)                    | Yes               | Yes            | No change needed                   |
| Error handling via ErrorBlock                               | Yes               | Yes            | Migrate to Try-Catch               |
| **Long identifier names**                                   | No (10 chars max) | Yes            | Rename for readability             |
| **Namespace**                                               | No                | Yes            | Add for modular organization       |
| **Annotations and Reflection**                              | No                | Yes            | Use for REST, etc.                 |
| **Typing (variables, functions, parameters)**               | No                | Yes            | Add type annotations               |
| **Try-Catch**                                               | No                | Yes            | Replace ErrorBlock patterns        |
| **Named parameters**                                        | No                | Yes            | Improve call-site readability      |
| **JSON inline**                                             | No                | Yes            | Replace JsonObject():New() chains  |
| **Class access modifiers (Private, Protected, Public)**     | No                | Yes            | Add encapsulation                  |
| **Class access modifiers (Private, Protected, Public)**     | No                | Yes            | Use modifiers ONLY in class declaration, NEVER in method implementation body |
| **Operator overloading**                                    | No                | Yes            | Add where semantically appropriate |
| **Abstract Interfaces**                                     | No                | Yes            | Define contracts for classes       |
| **StaticCall()**                                            | Yes               | **Prohibited** | Replace with direct calls          |
