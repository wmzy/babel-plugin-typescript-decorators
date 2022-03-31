@foo(1)
export class Greeter {
  constructor(message) {
    this.greeting = message;
  }
  @bar(2)
  greet(@baz(3) name) {
  }
}
