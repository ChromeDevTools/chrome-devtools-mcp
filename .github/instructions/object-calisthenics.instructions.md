---
applyTo: '**/*.{cs,ts,java}'
description: Enforces Object Calisthenics principles for business domain code to ensure clean, maintainable, and robust code
---
# Object Calisthenics Rules

> ⚠️ **Warning:** This file contains the 9 original Object Calisthenics rules. No additional rules must be added, and none of these rules should be replaced or removed.
> Examples may be added later if needed.

## Objective
This rule enforces the principles of Object Calisthenics to ensure clean, maintainable, and robust code in the backend, **primarily for business domain code**.

## Scope and Application
- **Primary focus**: Business domain classes (aggregates, entities, value objects, domain services)
- **Secondary focus**: Application layer services and use case handlers
- **Exemptions**: 
  - DTOs (Data Transfer Objects)
  - API models/contracts
  - Configuration classes
  - Simple data containers without business logic
  - Infrastructure code where flexibility is needed

## Key Principles


1. **One Level of Indentation per Method**:
   - Ensure methods are simple and do not exceed one level of indentation.

   ```csharp
   // Bad Example - this method has multiple levels of indentation
   public void SendNewsletter() {
         foreach (var user in users) {
            if (user.IsActive) {
               // Do something
               mailer.Send(user.Email);
            }
         }
   }
   // Good Example - Extracted method to reduce indentation
   public void SendNewsletter() {
       foreach (var user in users) {
           SendEmail(user);
       }
   }
   private void SendEmail(User user) {
       if (user.IsActive) {
           mailer.Send(user.Email);
       }
   }

   // Good Example - Filtering users before sending emails
   public void SendNewsletter() {
       var activeUsers = users.Where(user => user.IsActive);

       foreach (var user in activeUsers) {
           mailer.Send(user.Email);
       }
   }
   ```
2. **Don't Use the ELSE Keyword**:

   - Avoid using the `else` keyword to reduce complexity and improve readability.
   - Use early returns to handle conditions instead.
   - Use Fail Fast principle
   - Use Guard Clauses to validate inputs and conditions at the beginning of methods.

   ```csharp
   // Bad Example - Using else
   public void ProcessOrder(Order order) {
       if (order.IsValid) {
           // Process order
       } else {
           // Handle invalid order
       }
   }
   // Good Example - Avoiding else
   public void ProcessOrder(Order order) {
       if (!order.IsValid) return;
       // Process order
   }
   ```

   Sample Fail fast principle:
   ```csharp
   public void ProcessOrder(Order order) {
       if (order == null) throw new ArgumentNullException(nameof(order));
       if (!order.IsValid) throw new InvalidOperationException("Invalid order");
       // Process order
   }
   ```

3. **Wrapping All Primitives and Strings**:
   - Avoid using primitive types directly in your code.
   - Wrap them in classes to provide meaningful context and behavior.

   ```csharp
   // Bad Example - Using primitive types directly
   public class User {
       public string Name { get; set; }
       public int Age { get; set; }
   }
   // Good Example - Wrapping primitives
   public class User {
       private string name;
       private Age age;
       public User(string name, Age age) {
           this.name = name;
           this.age = age;
       }
   }
   public class Age {
       private int value;
       public Age(int value) {
           if (value < 0) throw new ArgumentOutOfRangeException(nameof(value), "Age cannot be negative");
           this.value = value;
       }
   }
   ```   

4. **First Class Collections**:
   - Use collections to encapsulate data and behavior, rather than exposing raw data structures.
First Class Collections: a class that contains an array as an attribute should not contain any other attributes

```csharp
   // Bad Example - Exposing raw collection
   public class Group {
      public int Id { get; private set; }
      public string Name { get; private set; }
      public List<User> Users { get; private set; }

      public int GetNumberOfUsersIsActive() {
         return Users
            .Where(user => user.IsActive)
            .Count();
      }
   }

   // Good Example - Encapsulating collection behavior
   public class Group {
      public int Id { get; private set; }
      public string Name { get; private set; }

      public GroupUserCollection userCollection { get; private set; } // The list of users is encapsulated in a class

      public int GetNumberOfUsersIsActive() {
         return userCollection
            .GetActiveUsers()
            .Count();
      }
   }
   ```

5. **One Dot per Line**:
   - Avoid violating Law of Demeter by only having a single dot per line.

   ```csharp
   // Bad Example - Multiple dots in a single line
   public void ProcessOrder(Order order) {
       var userEmail = order.User.GetEmail().ToUpper().Trim();
       // Do something with userEmail
   }
   // Good Example - One dot per line
   public class User {
     public NormalizedEmail GetEmail() {
       return NormalizedEmail.Create(/*...*/);       
     }
   }
   public class Order {
     /*...*/
     public NormalizedEmail ConfirmationEmail() {
       return User.GetEmail();         
     }
   }
   public void ProcessOrder(Order order) {
       var confirmationEmail = order.ConfirmationEmail();
       // Do something with confirmationEmail
   }
   ```

6. **Don't abbreviate**:
   - Use meaningful names for classes, methods, and variables.
   - Avoid abbreviations that can lead to confusion.

   ```csharp
   // Bad Example - Abbreviated names
   public class U {
       public string N { get; set; }
   }
   // Good Example - Meaningful names
   public class User {
       public string Name { get; set; }
   }
   ```

7. **Keep entities small (Class, method, namespace or package)**:
   - Limit the size of classes and methods to improve code readability and maintainability.
   - Each class should have a single responsibility and be as small as possible.
   
   Constraints:
   - Maximum 10 methods per class
   - Maximum 50 lines per class
   - Maximum 10 classes per package or namespace

   ```csharp
   // Bad Example - Large class with multiple responsibilities
   public class UserManager {
       public void CreateUser(string name) { /*...*/ }
       public void DeleteUser(int id) { /*...*/ }
       public void SendEmail(string email) { /*...*/ }
   }

   // Good Example - Small classes with single responsibility
   public class UserCreator {
       public void CreateUser(string name) { /*...*/ }
   }
   public class UserDeleter {
       public void DeleteUser(int id) { /*...*/ }
   }

   public class UserUpdater {
       public void UpdateUser(int id, string name) { /*...*/ }
   }
   ```


8. **No Classes with More Than Two Instance Variables**:
   - Encourage classes to have a single responsibility by limiting the number of instance variables.
   - Limit the number of instance variables to two to maintain simplicity.
   - Do not count ILogger or any other logger as instance variable.

   ```csharp
   // Bad Example - Class with multiple instance variables
   public class UserCreateCommandHandler {
      // Bad: Too many instance variables
      private readonly IUserRepository userRepository;
      private readonly IEmailService emailService;
      private readonly ILogger logger;
      private readonly ISmsService smsService;

      public UserCreateCommandHandler(IUserRepository userRepository, IEmailService emailService, ILogger logger, ISmsService smsService) {
         this.userRepository = userRepository;
         this.emailService = emailService;
         this.logger = logger;
         this.smsService = smsService;
      }
   }

   // Good: Class with two instance variables
   public class UserCreateCommandHandler {
      private readonly IUserRepository userRepository;
      private readonly INotificationService notificationService;
      private readonly ILogger logger; // This is not counted as instance variable

      public UserCreateCommandHandler(IUserRepository userRepository, INotificationService notificationService, ILogger logger) {
         this.userRepository = userRepository;
         this.notificationService = notificationService;
         this.logger = logger;
      }
   }
   ```

9. **No Getters/Setters in Domain Classes**:
   - Avoid exposing setters for properties in domain classes.
   - Use private constructors and static factory methods for object creation.
   - **Note**: This rule applies primarily to domain classes, not DTOs or data transfer objects.

   ```csharp
   // Bad Example - Domain class with public setters
   public class User {  // Domain class
       public string Name { get; set; } // Avoid this in domain classes
   }
   
   // Good Example - Domain class with encapsulation
   public class User {  // Domain class
       private string name;
       private User(string name) { this.name = name; }
       public static User Create(string name) => new User(name);
   }
   
   // Acceptable Example - DTO with public setters
   public class UserDto {  // DTO - exemption applies
       public string Name { get; set; } // Acceptable for DTOs
   }
   ```

## Implementation Guidelines
- **Domain Classes**:
  - Use private constructors and static factory methods for creating instances.
  - Avoid exposing setters for properties.
  - Apply all 9 rules strictly for business domain code.

- **Application Layer**:
  - Apply these rules to use case handlers and application services.
  - Focus on maintaining single responsibility and clean abstractions.

- **DTOs and Data Objects**:
  - Rules 3 (wrapping primitives), 8 (two instance variables), and 9 (no getters/setters) may be relaxed for DTOs.
  - Public properties with getters/setters are acceptable for data transfer objects.

- **Testing**:
  - Ensure tests validate the behavior of objects rather than their state.
  - Test classes may have relaxed rules for readability and maintainability.

- **Code Reviews**:
  - Enforce these rules during code reviews for domain and application code.
  - Be pragmatic about infrastructure and DTO code.

## References
- [Object Calisthenics - Original 9 Rules by Jeff Bay](https://www.cs.helsinki.fi/u/luontola/tdd-2009/ext/ObjectCalisthenics.pdf)
- [ThoughtWorks - Object Calisthenics](https://www.thoughtworks.com/insights/blog/object-calisthenics)
- [Clean Code: A Handbook of Agile Software Craftsmanship - Robert C. Martin](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
