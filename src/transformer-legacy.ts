// Fork of https://github.com/babel/babel/blob/e703e9f838459068bdc4e6b4ef119649862bbbba/packages/babel-plugin-proposal-decorators/src/transformer-legacy.ts

import { template, types as t } from "@babel/core";
import type { Visitor } from "@babel/traverse";

const buildClassDecorator = template(`
  DECORATOR(CLASS_REF = INNER) || CLASS_REF;
`) as (replacements: { DECORATOR; CLASS_REF; INNER }) => t.ExpressionStatement;

const buildParameterDecoratorForConstructor = template(`
  CLASS_REF = DECORATOR(CLASS_REF, undefined, INDEX) || CLASS_REF;
`) as (replacements: { DECORATOR; CLASS_REF; INDEX }) => t.ExpressionStatement;

const buildParameterDecoratorForMethod = template(`
  DECORATOR(CLASS_REF.prototype, METHOD, INDEX);
`) as (replacements: { DECORATOR; CLASS_REF; METHOD; INDEX }) => t.ExpressionStatement;

const buildClassPrototype = template(`
  CLASS_REF.prototype;
`) as (replacements: { CLASS_REF }) => t.ExpressionStatement;

const buildGetDescriptor = template(`
    Object.getOwnPropertyDescriptor(TARGET, PROPERTY);
`) as (replacements: { TARGET; PROPERTY }) => t.ExpressionStatement;

const buildGetObjectInitializer = template(`
    (TEMP = Object.getOwnPropertyDescriptor(TARGET, PROPERTY), (TEMP = TEMP ? TEMP.value : undefined), {
        enumerable: true,
        configurable: true,
        writable: true,
        initializer: function(){
            return TEMP;
        }
    })
`) as (replacements: { TEMP; TARGET; PROPERTY }) => t.ExpressionStatement;

const WARNING_CALLS = new WeakSet();

/**
 * If the decorator expressions are non-identifiers, hoist them to before the class so we can be sure
 * that they are evaluated in order.
 */
function applyEnsureOrdering(path) {
  // TODO: This should probably also hoist computed properties.
  const decorators = (
    path.isClass()
      ? [path].concat(path.get("body.body").flatMap(p => [p].concat(p.get("params") || [])))
      : path.get("properties")
  ).reduce((acc, prop) => acc.concat(prop.node?.decorators || []), []);

  const identDecorators = decorators.filter(
    decorator => !t.isIdentifier(decorator.expression),
  );
  if (identDecorators.length === 0) return;

  return t.sequenceExpression(
    identDecorators
      .map(decorator => {
        const expression = decorator.expression;
        const id = (decorator.expression =
          path.scope.generateDeclaredUidIdentifier("dec"));
        return t.assignmentExpression("=", id, expression);
      })
      .concat([path.node]),
  );
}

/**
 * Given a class expression with class-level decorators, create a new expression
 * with the proper decorated behavior.
 */
function applyClassDecorators(classPath) {
  if (!hasClassDecorators(classPath.node)) return;

  const decorators = classPath.node.decorators || [];
  classPath.node.decorators = null;

  const name = classPath.scope.generateDeclaredUidIdentifier("class");

  return decorators
    .map(dec => dec.expression)
    .reverse()
    .reduce(function (acc, decorator) {
      return buildClassDecorator({
        CLASS_REF: t.cloneNode(name),
        DECORATOR: t.cloneNode(decorator),
        INNER: acc,
      }).expression;
    }, classPath.node);
}

function hasClassDecorators(classNode) {
  return !!(classNode.decorators && classNode.decorators.length);
}

/**
 * Given a class expression with method-level decorators, create a new expression
 * with the proper decorated behavior.
 */
function applyMethodDecorators(path, state) {
  if (!hasMethodDecorators(path.node.body.body)) return;

  return applyTargetDecorators(path, state, path.node.body.body);
}

function hasMethodDecorators(body) {
  return body.some(node => node.decorators?.length);
}

/**
 * Given an object expression with property decorators, create a new expression
 * with the proper decorated behavior.
 */
function applyObjectDecorators(path, state) {
  if (!hasMethodDecorators(path.node.properties)) return;

  return applyTargetDecorators(path, state, path.node.properties);
}

/**
 * A helper to pull out property decorators into a sequence expression.
 */
function applyTargetDecorators(path, state, decoratedProps) {
  const name = path.scope.generateDeclaredUidIdentifier(
    path.isClass() ? "class" : "obj",
  );

  const exprs = decoratedProps.reduce(function (acc, node) {
    const decorators = node.decorators || [];
    node.decorators = null;

    if (decorators.length === 0) return acc;

    if (node.computed) {
      throw path.buildCodeFrameError(
        "Computed method/property decorators are not yet supported.",
      );
    }

    const property = t.isLiteral(node.key)
      ? node.key
      : t.stringLiteral(node.key.name);

    const target =
      path.isClass() && !node.static
        ? buildClassPrototype({
            CLASS_REF: name,
          }).expression
        : name;

    if (t.isClassProperty(node, { static: false })) {
      const descriptor = path.scope.generateDeclaredUidIdentifier("descriptor");

      const initializer = node.value
        ? t.functionExpression(
            null,
            [],
            t.blockStatement([t.returnStatement(node.value)]),
          )
        : t.nullLiteral();

      // https://github.com/babel/babel/blob/2b702573727131f4708755228bca584462b23110/packages/babel-plugin-transform-typescript/src/index.ts#L150
      // node.value = t.callExpression(
      //   state.addHelper("initializerWarningHelper"),
      //   [descriptor, t.thisExpression()],
      // );
      node.value = null;

      // WARNING_CALLS.add(node.value);

      acc.push(
        t.assignmentExpression(
          "=",
          t.cloneNode(descriptor),
          t.callExpression(state.addHelper("applyDecoratedDescriptor"), [
            t.cloneNode(target),
            t.cloneNode(property),
            t.arrayExpression(
              decorators.map(dec => t.cloneNode(dec.expression)),
            ),
            t.objectExpression([
              t.objectProperty(
                t.identifier("configurable"),
                t.booleanLiteral(true),
              ),
              t.objectProperty(
                t.identifier("enumerable"),
                t.booleanLiteral(true),
              ),
              t.objectProperty(
                t.identifier("writable"),
                t.booleanLiteral(true),
              ),
              t.objectProperty(t.identifier("initializer"), initializer),
            ]),
          ]),
        ),
      );
    } else {
      acc.push(
        t.callExpression(state.addHelper("applyDecoratedDescriptor"), [
          t.cloneNode(target),
          t.cloneNode(property),
          t.arrayExpression(decorators.map(dec => t.cloneNode(dec.expression))),
          t.isObjectProperty(node) || t.isClassProperty(node, { static: true })
            ? buildGetObjectInitializer({
                TEMP: path.scope.generateDeclaredUidIdentifier("init"),
                TARGET: t.cloneNode(target),
                PROPERTY: t.cloneNode(property),
              }).expression
            : buildGetDescriptor({
                TARGET: t.cloneNode(target),
                PROPERTY: t.cloneNode(property),
              }).expression,
          t.cloneNode(target),
        ]),
      );
    }

    return acc;
  }, []);

  return t.sequenceExpression([
    t.assignmentExpression("=", t.cloneNode(name), path.node),
    t.sequenceExpression(exprs),
    t.cloneNode(name),
  ]);
}

function hasParameterDecorators(body) {
  return body.some(node => node.params?.length && node.params.some(p => p.decorators?.length));
}

function applyParameterDecorators(path) {
  const decoratedProps = path.node.body.body.filter(p => p.params?.length && p.params.some(p => p.decorators?.length));

  if (!decoratedProps.length) return;

  const name = path.scope.generateDeclaredUidIdentifier("class");

  const decoratedConstructor = decoratedProps.find(p => p.kind === "constructor");
  const decoratedMethodProps = decoratedProps.filter(p => p.kind !== "constructor");
  const expressionArray = decoratedMethodProps.map(function (decoratedMethodNode) {
    const property = t.isLiteral(decoratedMethodNode.key)
    ? decoratedMethodNode.key
    : t.stringLiteral(decoratedMethodNode.key.name);
    return decoratedMethodNode.params.map((param, index) => {
      return param.decorators?.reverse().map(dec => buildParameterDecoratorForMethod({
        DECORATOR: t.cloneNode(dec.expression), CLASS_REF: t.cloneNode(name), METHOD: t.cloneNode(property), INDEX: t.numericLiteral(index),
      }).expression);
    });
  });

  if (decoratedConstructor) {
    expressionArray.push(decoratedConstructor.params.map((param, index) => {
      return param.decorators?.reverse().map(dec => buildParameterDecoratorForConstructor({
        DECORATOR: t.cloneNode(dec.expression), CLASS_REF: t.cloneNode(name), INDEX: t.numericLiteral(index),
      }).expression);
    }));
  }

  decoratedProps.forEach(p => p.params.forEach(p => p.decorators = null));

  return t.sequenceExpression([
    t.assignmentExpression("=", t.cloneNode(name), path.node),
    t.sequenceExpression(expressionArray.flat().flat().filter(Boolean)),
    t.cloneNode(name),
  ]);
}

function decoratedClassToExpression({ node, scope }) {
  if (!hasClassDecorators(node) && !hasMethodDecorators(node.body.body) && !hasParameterDecorators(node.body.body)) {
    return;
  }

  const ref = node.id
    ? t.cloneNode(node.id)
    : scope.generateUidIdentifier("class");

  return t.variableDeclaration("let", [
    t.variableDeclarator(ref, t.toExpression(node)),
  ]);
}

export default {
  ExportDefaultDeclaration(path) {
    const decl = path.get("declaration");
    if (!decl.isClassDeclaration()) return;

    const replacement = decoratedClassToExpression(decl);
    if (replacement) {
      const [varDeclPath] = path.replaceWithMultiple([
        replacement,
        t.exportNamedDeclaration(null, [
          t.exportSpecifier(
            // @ts-expect-error todo(flow->ts) might be add more specific return type for decoratedClassToExpression
            t.cloneNode(replacement.declarations[0].id),
            t.identifier("default"),
          ),
        ]),
      ]);

      if (!decl.node.id) {
        path.scope.registerDeclaration(varDeclPath);
      }
    }
  },
  ClassDeclaration(path) {
    const replacement = decoratedClassToExpression(path);
    if (replacement) {
      path.replaceWith(replacement);
    }
  },
  ClassExpression(path, state) {
    // Create a replacement for the class node if there is one. We do one pass to replace classes with
    // class decorators, and a second pass to process method decorators.
    const decoratedClass =
      applyEnsureOrdering(path) ||
      applyClassDecorators(path) ||
      applyMethodDecorators(path, state) ||
      applyParameterDecorators(path);

    if (decoratedClass) path.replaceWith(decoratedClass);
  },
  ObjectExpression(path, state) {
    const decoratedObject =
      applyEnsureOrdering(path) || applyObjectDecorators(path, state);

    if (decoratedObject) path.replaceWith(decoratedObject);
  },

  AssignmentExpression(path, state) {
    if (!WARNING_CALLS.has(path.node.right)) return;

    path.replaceWith(
      t.callExpression(state.addHelper("initializerDefineProperty"), [
        // @ts-expect-error todo(flow->ts) typesafe NodePath.get
        t.cloneNode(path.get("left.object").node),
        t.stringLiteral(
          // @ts-expect-error todo(flow->ts) typesafe NodePath.get
          path.get("left.property").node.name ||
            // @ts-expect-error todo(flow->ts) typesafe NodePath.get
            path.get("left.property").node.value,
        ),
        // @ts-expect-error todo(flow->ts)
        t.cloneNode(path.get("right.arguments")[0].node),
        // @ts-expect-error todo(flow->ts)
        t.cloneNode(path.get("right.arguments")[1].node),
      ]),
    );
  },

  CallExpression(path, state) {
    if (path.node.arguments.length !== 3) return;
    if (!WARNING_CALLS.has(path.node.arguments[2])) return;

    // If the class properties plugin isn't enabled, this line will add an unused helper
    // to the code. It's not ideal, but it's ok since the configuration is not valid anyway.
    // @ts-expect-error todo(flow->ts) check that `callee` is Identifier
    if (path.node.callee.name !== state.addHelper("defineProperty").name) {
      return;
    }

    path.replaceWith(
      t.callExpression(state.addHelper("initializerDefineProperty"), [
        t.cloneNode(path.get("arguments")[0].node),
        t.cloneNode(path.get("arguments")[1].node),
        // @ts-expect-error todo(flow->ts)
        t.cloneNode(path.get("arguments.2.arguments")[0].node),
        // @ts-expect-error todo(flow->ts)
        t.cloneNode(path.get("arguments.2.arguments")[1].node),
      ]),
    );
  },
} as Visitor<any>;
