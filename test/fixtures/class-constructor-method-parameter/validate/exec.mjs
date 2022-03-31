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

class Greeter {
  constructor(message) {
    this.greeting = message;
  }

  @validate
  greet(@required('name') name) {
    const greeting = 'how are you?';
    return 'Hello ' + name + ', ' + (this.greeting || greeting);
  }

  @validate
  talk(@optional name = 'friend') {
    return 'Nice talk to you ' + name + '.';
  }

  @validate
  welcome(@required('firstName') firstName, @required('lastName') lastName) {
    return 'Welcome ' + lastName + '.' + firstName;
  }

  @validate
  meet(@required('guest') { name: nickname, title }) {
    return 'Nice to meet you ' + title + ' ' + nickname + '.';
  }
}

{
  const greeter = new Greeter('Nice to meet you!');
  const message = greeter.greet('Warner');

  expect(message).toEqual('Hello Warner, Nice to meet you!');
}

{
  const greeter = new Greeter();
  const message = greeter.greet('Warner');

  expect(message).toEqual('Hello Warner, how are you?');
}

  expect(() =>  {
    const greeter = new Greeter('Nice to meet you!');
    const message = greeter.greet();
  }).toThrowError('name is required');

  expect(() =>  {
    const greeter = new Greeter();
    const message = greeter.welcome('Hooh');
  }).toThrowError('lastName is required');

{
  const greeter = new Greeter();
  const message = greeter.welcome('Hooh', 'Warner');

  expect(message).toEqual('Welcome Warner.Hooh');
}

expect(() => {
    const greeter = new Greeter();
    const message = greeter.meet();
}).toThrowError('guest is required');

{
  const greeter = new Greeter();
  const message = greeter.meet({ name: 'Hooh', title: 'Mr' });

  expect(message).toEqual('Nice to meet you Mr Hooh.');
}

{
  const greeter = new Greeter();
  const message = greeter.talk('Hooh');

  expect(message).toEqual('Nice talk to you Hooh.');
}

{
  const greeter = new Greeter();
  const message = greeter.talk();

  expect(message).toEqual('Nice talk to you friend.');
}
