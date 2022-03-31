function validate(target, property, descriptor) {
  const fn = descriptor.value;

  descriptor.value = function (...args) {
    const req_metadata = `meta_req_${property}`;
    (target[req_metadata] || []).forEach(function (metadata) {
      if (args[metadata.index] === undefined) {
        throw new Error(`${metadata.key} is required`);
      }
    });

    const opt_metadata = `meta_opt_${property}`;
    (target[opt_metadata] || []).forEach(function (metadata) {
      if (args[metadata.index] === undefined) {
        console.warn(
          `The ${
            metadata.index + 1
          }(th) optional argument is missing of method ${fn.name}`
        );
      }
    });

    return fn.apply(this, args);
  };

  return descriptor;
}

function required(key) {
  return function (target, propertyKey, parameterIndex) {
    const metadata = `meta_req_${propertyKey}`;
    target[metadata] = [
      ...(target[metadata] || []),
      {
        index: parameterIndex,
        key,
      },
    ];
  };
}

function optional(target, propertyKey, parameterIndex) {
  const metadata = `meta_opt_${propertyKey}`;
  target[metadata] = [
    ...(target[metadata] || []),
    {
      index: parameterIndex,
    },
  ];
}

function Inject(Clazz) {
  return function (target, unusedKey, parameterIndex) {
    const metadata = `meta_ctr_inject`;
    target[metadata] = target[metadata] || [];
    target[metadata][parameterIndex] = Clazz;

    return target;
  };
}

function Factory(target) {
  const metadata = `meta_ctr_inject`;

  return class extends target {
    constructor(...args) {
      const metaInject = target[metadata] || [];
      for (let i = 0; i < metaInject.length; i++) {
        const Clazz = metaInject[i];
        if (Clazz && args[i] === null) {
          args[i] = Reflect.construct(Clazz, []);
        }
      }
      super(...args);
    }
  };
}

export class UserRepo {}

export interface Counter {
  number: number
}

export class Sentinel {
  public counter:Counter = { number: 0 };

  count() {
    this.counter.number++;
  }
}

@Factory
export class Greeter {

  private counter: Counter;

  constructor(
    private greeting: string,
    @Inject(Sentinel) private sentinel: Sentinel,
    @Inject(UserRepo) private userRepo: UserRepo
  ) {

    this.counter = this.sentinel.counter;
  }

  @validate
  greet(@required('name') name: string, @optional emoj) {
    this.sentinel.count();

    const greeting = 'how are you?';
    return "Hello " + name + ", " + (this.greeting || greeting);
  }

  @validate
  talk(@optional name: string = 'friend') {
    return "Nice talk to you " + name + ".";
  }

  @validate
  welcome(@required('firstName') firstName: string, @required('lastName') lastName: string) {
    this.sentinel.count();

    return "Welcome " + lastName + "." + firstName;
  }

  @validate
  meet(@required('guest') { name: nickname, title }) {
    this.sentinel.count();

    return "Nice to meet you " + title + ' ' + nickname + '.';
  }

  count() {
    return this.counter.number;
  }
}

function myFunctionToBeExported() {}

export class GreeterFactory {
  static build(greeting): Greeter {
    return new Greeter(greeting, null, null);
  }
}

{
  const greeter = GreeterFactory.build('Nice to meet you!');
  const message = greeter.greet('Warner', '😆');

  expect(message).toEqual('Hello Warner, Nice to meet you!');
}

{
  const greeter = GreeterFactory.build();
  const message = greeter.greet('Warner');

  expect(message).toEqual('Hello Warner, how are you?')
}

  expect(() => {
    const greeter = GreeterFactory.build('Nice to meet you!');
    const message = greeter.greet();
  }).toThrowError('name is required')

  expect(() => {
    const greeter = GreeterFactory.build();
    const message = greeter.welcome('Hooh');
  }).toThrowError('lastName is required');

{
  const greeter = GreeterFactory.build();
  const message = greeter.welcome('Hooh', 'Warner');

  expect(message).toEqual('Welcome Warner.Hooh');
}

expect(() => {
    const greeter = GreeterFactory.build();
    const message = greeter.meet();
  }).toThrowError('guest is required');

{
  const greeter = GreeterFactory.build();
  const message = greeter.meet({ name: 'Hooh', title: 'Mr' });

  expect(message).toEqual( 'Nice to meet you Mr Hooh.');
}

{
  const greeter = GreeterFactory.build();
  greeter.greet('bro');
  greeter.welcome('Hooh', 'Warner');
  expect(greeter.count()).toEqual(2);
}

{
  const greeter = GreeterFactory.build();
  const message = greeter.talk('Hooh');

  expect(message).toEqual('Nice talk to you Hooh.');
}

{
  const greeter = GreeterFactory.build();
  const message = greeter.talk();

  expect(message).toEqual('Nice talk to you friend.');
}
