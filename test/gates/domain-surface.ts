import { readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '../..');

// The checker needs only the types of the given files and of their imports.
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

// A method whose name starts with get is a getter (class of 2026-11-09).
const GET_METHOD = /^get/;

// A value object delivers its datum to a receiver of the border. The
// delivery passes a primitive on purpose (decision 15), so the gate accepts
// these declarations. Rule R-no-delivery-call keeps their calls out of the core.
const DELIVERY_OPERATIONS = new Set(['deliverTo', 'deliverKeyTo', 'deliverBoundsTo']);

type Signature = ts.SignatureDeclaration;

// Gives every .ts file under a folder of the repository, as a path from the
// repository root with forward slashes, in sorted order.
export function typeScriptFilesIn(directory: string): string[] {
  return readdirSync(resolve(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `${directory}/${path.split(sep).join('/')}`)
    .sort();
}

// Gives one key per site that breaks the domain surface rule, in the order of
// the source. A key is "<file> <subject> <kind>", for example
// "src/domain/user/user.ts User.passwordMatches(typed) parameter".
export function surfaceSitesOf(files: readonly string[]): string[] {
  const program = ts.createProgram(
    files.map((file) => resolve(ROOT, file)),
    COMPILER_OPTIONS,
  );
  const checker = program.getTypeChecker();
  return files.flatMap((file) => {
    const source = program.getSourceFile(resolve(ROOT, file));
    if (source === undefined) {
      throw new Error(`The domain surface gate cannot read ${file}.`);
    }
    return new ModuleSurface(file, source, checker).sites();
  });
}

// Compares the sites of the code with the baseline, one entry per site. An
// unlisted site is a new break. A stale entry names a site that the code no
// longer has.
export function baselineDrift(
  sites: readonly string[],
  baseline: readonly string[],
): { unlisted: string[]; stale: string[] } {
  return { unlisted: without(sites, baseline), stale: without(baseline, sites) };
}

// Removes each item of `removed` once from `items`.
function without(items: readonly string[], removed: readonly string[]): string[] {
  const left = [...removed];
  return items.filter((item) => {
    const index = left.indexOf(item);
    if (index === -1) {
      return true;
    }
    left.splice(index, 1);
    return false;
  });
}

// The sites of the exported declarations of one module.
class ModuleSurface {
  private readonly found: string[] = [];

  constructor(
    private readonly file: string,
    private readonly source: ts.SourceFile,
    private readonly checker: ts.TypeChecker,
  ) {}

  sites(): string[] {
    const exported = this.exportedDeclarations();
    for (const statement of this.source.statements) {
      const declarations = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations
        : [statement];
      for (const declaration of declarations) {
        if (exported.has(declaration)) {
          this.checkDeclaration(declaration);
        }
      }
    }
    return this.found;
  }

  // An `export` keyword, an `export { name }` list and a default export all
  // export a declaration. A re-export of another module names no declaration
  // of this file.
  private exportedDeclarations(): Set<ts.Node> {
    const module = this.checker.getSymbolAtLocation(this.source);
    if (module === undefined) {
      return new Set();
    }
    return new Set(
      this.checker
        .getExportsOfModule(module)
        .map((symbol) =>
          symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol,
        )
        .flatMap((symbol) => symbol.declarations ?? [])
        .filter((declaration) => declaration.getSourceFile() === this.source),
    );
  }

  private checkDeclaration(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      this.checkClass(node);
    } else if (ts.isInterfaceDeclaration(node)) {
      this.checkInterface(node);
    } else if (ts.isTypeAliasDeclaration(node)) {
      this.checkTypeAlias(node);
    } else if (ts.isFunctionDeclaration(node)) {
      this.checkSignature(node.name?.text ?? 'default', node);
    } else if (ts.isVariableDeclaration(node) && this.namesPrimitive(this.typeOf(node))) {
      this.report(this.text(node.name), 'constant');
    }
  }

  private checkClass(node: ts.ClassDeclaration): void {
    const owner = node.name?.text ?? 'default';
    const valueObject = node.members.some(
      (member) => ts.isMethodDeclaration(member) && DELIVERY_OPERATIONS.has(this.text(member.name)),
    );
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member)) {
        this.checkConstructor(owner, member);
      } else if (isPrivate(member)) {
        continue;
      } else if (ts.isPropertyDeclaration(member)) {
        this.report(`${owner}.${this.text(member.name)}`, 'field');
      } else if (ts.isGetAccessorDeclaration(member)) {
        this.report(`${owner}.${this.text(member.name)}`, 'get-accessor');
      } else if (ts.isSetAccessorDeclaration(member)) {
        this.report(`${owner}.${this.text(member.name)}`, 'set-accessor');
      } else if (ts.isMethodDeclaration(member)) {
        this.checkMethod(owner, member, valueObject);
      }
    }
  }

  // A parameter with a modifier other than private declares a public field,
  // also in a private constructor. The other parameters of a constructor that
  // is not private are a public signature.
  private checkConstructor(owner: string, node: ts.ConstructorDeclaration): void {
    for (const parameter of node.parameters) {
      if (isPublicParameterField(parameter, node)) {
        this.report(`${owner}.${this.text(parameter.name)}`, 'field');
      }
    }
    if (!isPrivate(node)) {
      const plainParameters = node.parameters.filter(
        (parameter) => !isPublicParameterField(parameter, node),
      );
      this.checkParameters(`${owner}.constructor`, plainParameters);
    }
  }

  private checkMethod(owner: string, node: ts.MethodDeclaration, valueObject: boolean): void {
    const name = this.text(node.name);
    if (GET_METHOD.test(name)) {
      this.report(`${owner}.${name}`, 'get-method');
    } else if (DELIVERY_OPERATIONS.has(name)) {
      return;
    } else if (valueObject && this.isRawValueFactory(owner, node)) {
      // The parameters take the raw value. The return type still counts.
      this.checkSignature(`${owner}.${name}`, node, { parameters: false });
    } else {
      this.checkSignature(`${owner}.${name}`, node);
    }
  }

  // The factory of a value object is static, returns its class or a Result of
  // it, and takes only raw values. A factory that also takes a domain value,
  // such as PlayerProgress.start(key, at), takes no raw value.
  private isRawValueFactory(owner: string, node: ts.MethodDeclaration): boolean {
    return (
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static) !== 0 &&
      returnsClass(node.type, owner) &&
      node.parameters.every((parameter) => this.namesPrimitive(this.typeOf(parameter)))
    );
  }

  // Every member of an interface is public.
  private checkInterface(node: ts.InterfaceDeclaration): void {
    const owner = node.name.text;
    for (const member of node.members) {
      if (ts.isPropertySignature(member)) {
        this.report(`${owner}.${this.text(member.name)}`, 'field');
      } else if (ts.isMethodSignature(member)) {
        const name = this.text(member.name);
        if (GET_METHOD.test(name)) {
          this.report(`${owner}.${name}`, 'get-method');
        } else if (!DELIVERY_OPERATIONS.has(name)) {
          this.checkSignature(`${owner}.${name}`, member);
        }
      }
    }
  }

  // A function type is a signature. Any other type is one site.
  private checkTypeAlias(node: ts.TypeAliasDeclaration): void {
    if (ts.isFunctionTypeNode(node.type)) {
      this.checkSignature(node.name.text, node.type);
    } else if (this.namesPrimitive(node.type)) {
      this.report(node.name.text, 'type');
    }
  }

  private checkSignature(subject: string, node: Signature, { parameters = true } = {}): void {
    if (parameters) {
      this.checkParameters(subject, node.parameters);
    }
    if (this.namesPrimitive(this.returnTypeOf(node))) {
      this.report(`${subject}()`, 'return');
    }
  }

  private checkParameters(subject: string, parameters: readonly ts.ParameterDeclaration[]): void {
    for (const parameter of parameters) {
      if (this.namesPrimitive(this.typeOf(parameter))) {
        this.report(`${subject}(${this.text(parameter.name)})`, 'parameter');
      }
    }
  }

  // The written type, or the type that the checker infers. A literal type
  // counts as its base type: `const NAME = 'ada'` exports a string.
  private typeOf(node: ts.ParameterDeclaration | ts.VariableDeclaration): ts.TypeNode | undefined {
    if (node.type !== undefined) {
      return node.type;
    }
    const type = this.checker.getBaseTypeOfLiteralType(this.checker.getTypeAtLocation(node.name));
    return this.checker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.NoTruncation);
  }

  private returnTypeOf(node: Signature): ts.TypeNode | undefined {
    if (node.type !== undefined) {
      return node.type;
    }
    const signature = this.checker.getSignatureFromDeclaration(node);
    if (signature === undefined) {
      return undefined;
    }
    const type = this.checker.getBaseTypeOfLiteralType(signature.getReturnType());
    return this.checker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.NoTruncation);
  }

  // Tells if a type names string, number or Date anywhere: in a union, an
  // array, a type argument or a function type. A literal type such as
  // 'invalid-password' and the boolean pass.
  private namesPrimitive(node: ts.Node | undefined): boolean {
    if (node === undefined) {
      return false;
    }
    if (node.kind === ts.SyntaxKind.StringKeyword || node.kind === ts.SyntaxKind.NumberKeyword) {
      return true;
    }
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      ts.idText(node.typeName) === 'Date'
    ) {
      return true;
    }
    return ts.forEachChild(node, (child) => this.namesPrimitive(child) || undefined) ?? false;
  }

  // The source text of a name, without white space.
  private text(node: ts.Node): string {
    return node.getText(this.source).replace(/\s+/g, '');
  }

  private report(subject: string, kind: string): void {
    this.found.push(`${this.file} ${subject} ${kind}`);
  }
}

// Tells if a written return type is the class, such as Score or Range<T>, or
// a Result of the class, such as Result<Password, PasswordProblem>.
function returnsClass(type: ts.TypeNode | undefined, owner: string): boolean {
  if (type === undefined || !ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) {
    return false;
  }
  const name = ts.idText(type.typeName);
  return name === owner || (name === 'Result' && returnsClass(type.typeArguments?.[0], owner));
}

function isPrivate(node: ts.Declaration): boolean {
  const name = (node as ts.NamedDeclaration).name;
  return (
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Private) !== 0 ||
    (name !== undefined && ts.isPrivateIdentifier(name))
  );
}

function isPublicParameterField(
  parameter: ts.ParameterDeclaration,
  constructor: ts.ConstructorDeclaration,
): boolean {
  return ts.isParameterPropertyDeclaration(parameter, constructor) && !isPrivate(parameter);
}
