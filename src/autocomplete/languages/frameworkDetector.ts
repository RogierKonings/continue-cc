import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FrameworkInfo {
  id: string;
  name: string;
  language: string;
  patterns: {
    files?: string[];
    dependencies?: string[];
    imports?: RegExp[];
    fileContent?: RegExp[];
  };
  completionPatterns?: {
    components?: string[];
    hooks?: string[];
    directives?: string[];
    decorators?: string[];
    methods?: string[];
  };
}

export class FrameworkDetector {
  private static readonly FRAMEWORKS: FrameworkInfo[] = [
    // JavaScript/TypeScript frameworks
    {
      id: 'react',
      name: 'React',
      language: 'javascript',
      patterns: {
        dependencies: ['react', 'react-dom'],
        imports: [/from\s+['"]react['"]/, /import\s+React/],
        fileContent: [/<[A-Z]\w*/, /\.(jsx|tsx)$/],
      },
      completionPatterns: {
        components: ['useState', 'useEffect', 'useContext', 'useReducer', 'useMemo', 'useCallback'],
        hooks: [
          'useState',
          'useEffect',
          'useContext',
          'useReducer',
          'useMemo',
          'useCallback',
          'useRef',
          'useLayoutEffect',
        ],
        methods: ['render', 'componentDidMount', 'componentDidUpdate', 'componentWillUnmount'],
      },
    },
    {
      id: 'vue',
      name: 'Vue.js',
      language: 'javascript',
      patterns: {
        files: ['vue.config.js', '.vuerc'],
        dependencies: ['vue', '@vue/cli'],
        imports: [/from\s+['"]vue['"]/, /import\s+Vue/],
        fileContent: [/<template>/, /<script>/, /<style/, /\.vue$/],
      },
      completionPatterns: {
        directives: ['v-if', 'v-else', 'v-for', 'v-model', 'v-show', 'v-bind', 'v-on'],
        hooks: ['onMounted', 'onUnmounted', 'onUpdated', 'onBeforeMount', 'onBeforeUnmount'],
        methods: ['data', 'computed', 'methods', 'watch', 'created', 'mounted'],
      },
    },
    {
      id: 'angular',
      name: 'Angular',
      language: 'typescript',
      patterns: {
        files: ['angular.json', '.angular.json'],
        dependencies: ['@angular/core', '@angular/cli'],
        imports: [/from\s+['"]@angular/, /@Component\s*\(/, /@Injectable\s*\(/],
        fileContent: [/@Component/, /@NgModule/, /@Injectable/, /\*ngFor/, /\*ngIf/],
      },
      completionPatterns: {
        decorators: ['@Component', '@Injectable', '@NgModule', '@Input', '@Output', '@ViewChild'],
        directives: ['*ngFor', '*ngIf', '*ngSwitch', '[ngClass]', '[ngStyle]', '[(ngModel)]'],
        methods: ['ngOnInit', 'ngOnDestroy', 'ngOnChanges', 'ngAfterViewInit'],
      },
    },
    {
      id: 'nextjs',
      name: 'Next.js',
      language: 'javascript',
      patterns: {
        files: ['next.config.js', 'next.config.ts'],
        dependencies: ['next', 'react', 'react-dom'],
        imports: [/from\s+['"]next\//, /import.*from\s+['"]next/],
      },
      completionPatterns: {
        components: ['getStaticProps', 'getServerSideProps', 'getStaticPaths'],
        hooks: ['useRouter', 'useSearchParams', 'usePathname'],
        methods: ['getInitialProps', 'getStaticProps', 'getServerSideProps'],
      },
    },

    // Python frameworks
    {
      id: 'django',
      name: 'Django',
      language: 'python',
      patterns: {
        files: ['manage.py', 'settings.py', 'urls.py'],
        dependencies: ['django'],
        imports: [/from\s+django/, /import\s+django/],
        fileContent: [/from\s+django\./, /class.*\(models\.Model\)/, /urlpatterns\s*=/],
      },
      completionPatterns: {
        decorators: ['@login_required', '@csrf_exempt', '@require_http_methods'],
        methods: ['get', 'post', 'put', 'delete', 'get_queryset', 'get_context_data'],
      },
    },
    {
      id: 'flask',
      name: 'Flask',
      language: 'python',
      patterns: {
        dependencies: ['flask'],
        imports: [/from\s+flask/, /import\s+flask/],
        fileContent: [/@app\.route/, /Flask\(__name__\)/],
      },
      completionPatterns: {
        decorators: ['@app.route', '@login_required', '@cache.cached'],
        methods: ['before_request', 'after_request', 'errorhandler'],
      },
    },

    // Java frameworks
    {
      id: 'spring',
      name: 'Spring',
      language: 'java',
      patterns: {
        files: ['pom.xml', 'build.gradle'],
        dependencies: ['spring-boot-starter', 'spring-core'],
        imports: [/import\s+org\.springframework/],
        fileContent: [/@SpringBootApplication/, /@RestController/, /@Service/, /@Repository/],
      },
      completionPatterns: {
        decorators: [
          '@RestController',
          '@Service',
          '@Repository',
          '@Component',
          '@Autowired',
          '@GetMapping',
          '@PostMapping',
        ],
      },
    },

    // Node.js frameworks
    {
      id: 'express',
      name: 'Express.js',
      language: 'javascript',
      patterns: {
        dependencies: ['express'],
        imports: [/require\(['"]express['"]\)/, /from\s+['"]express['"]/],
        fileContent: [/app\.(get|post|put|delete)\(/, /express\(\)/],
      },
      completionPatterns: {
        methods: ['app.get', 'app.post', 'app.put', 'app.delete', 'app.use', 'app.listen'],
      },
    },
  ];

  private static cachedDetection: Map<string, FrameworkInfo[]> = new Map();

  /**
   * Detect frameworks in a workspace
   */
  static async detectFrameworks(workspaceFolder: vscode.WorkspaceFolder): Promise<FrameworkInfo[]> {
    const cacheKey = workspaceFolder.uri.fsPath;

    // Check cache first
    if (this.cachedDetection.has(cacheKey)) {
      return this.cachedDetection.get(cacheKey)!;
    }

    const detectedFrameworks: FrameworkInfo[] = [];

    // Check package.json for Node.js projects
    const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const framework of this.FRAMEWORKS) {
        if (framework.patterns.dependencies) {
          const hasAllDeps = framework.patterns.dependencies.every((dep) => dep in dependencies);
          if (hasAllDeps) {
            detectedFrameworks.push(framework);
          }
        }
      }
    }

    // Check for framework-specific files
    for (const framework of this.FRAMEWORKS) {
      if (framework.patterns.files && !detectedFrameworks.includes(framework)) {
        const hasFile = framework.patterns.files.some((file) =>
          fs.existsSync(path.join(workspaceFolder.uri.fsPath, file))
        );
        if (hasFile) {
          detectedFrameworks.push(framework);
        }
      }
    }

    // Cache the result
    this.cachedDetection.set(cacheKey, detectedFrameworks);

    return detectedFrameworks;
  }

  /**
   * Detect framework from document content
   */
  static detectFrameworkFromContent(document: vscode.TextDocument): FrameworkInfo[] {
    const content = document.getText();
    const languageId = document.languageId;
    const detectedFrameworks: FrameworkInfo[] = [];

    for (const framework of this.FRAMEWORKS) {
      // Check if framework is for this language
      if (
        framework.language !== languageId &&
        !(framework.language === 'javascript' && languageId === 'typescript') &&
        !(framework.language === 'javascript' && languageId === 'javascriptreact') &&
        !(framework.language === 'javascript' && languageId === 'typescriptreact')
      ) {
        continue;
      }

      // Check imports
      if (framework.patterns.imports) {
        const hasImport = framework.patterns.imports.some((pattern) => pattern.test(content));
        if (hasImport) {
          detectedFrameworks.push(framework);
          continue;
        }
      }

      // Check file content patterns
      if (framework.patterns.fileContent) {
        const hasPattern = framework.patterns.fileContent.some((pattern) => pattern.test(content));
        if (hasPattern) {
          detectedFrameworks.push(framework);
        }
      }
    }

    return detectedFrameworks;
  }

  /**
   * Get framework-specific completions
   */
  static getFrameworkCompletions(
    frameworks: FrameworkInfo[],
    context: vscode.CompletionContext,
    position: vscode.Position,
    document: vscode.TextDocument
  ): vscode.CompletionItem[] {
    const completions: vscode.CompletionItem[] = [];
    const line = document.lineAt(position).text;
    const prefix = line.substring(0, position.character);

    for (const framework of frameworks) {
      if (!framework.completionPatterns) continue;

      // Add component/hook completions
      if (framework.completionPatterns.components) {
        for (const component of framework.completionPatterns.components) {
          const item = new vscode.CompletionItem(component, vscode.CompletionItemKind.Function);
          item.detail = `${framework.name} component`;
          item.documentation = `Import and use ${component} from ${framework.name}`;
          completions.push(item);
        }
      }

      // Add decorator completions
      if (framework.completionPatterns.decorators && prefix.includes('@')) {
        for (const decorator of framework.completionPatterns.decorators) {
          const item = new vscode.CompletionItem(decorator, vscode.CompletionItemKind.Property);
          item.detail = `${framework.name} decorator`;
          completions.push(item);
        }
      }

      // Add directive completions
      if (framework.completionPatterns.directives) {
        for (const directive of framework.completionPatterns.directives) {
          const item = new vscode.CompletionItem(directive, vscode.CompletionItemKind.Property);
          item.detail = `${framework.name} directive`;
          completions.push(item);
        }
      }

      // Add method completions
      if (framework.completionPatterns.methods) {
        for (const method of framework.completionPatterns.methods) {
          const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
          item.detail = `${framework.name} method`;
          completions.push(item);
        }
      }
    }

    return completions;
  }

  /**
   * Clear framework detection cache
   */
  static clearCache(): void {
    this.cachedDetection.clear();
  }

  /**
   * Get all supported frameworks
   */
  static getSupportedFrameworks(): FrameworkInfo[] {
    return [...this.FRAMEWORKS];
  }

  /**
   * Check if a framework is supported
   */
  static isFrameworkSupported(frameworkId: string): boolean {
    return this.FRAMEWORKS.some((f) => f.id === frameworkId);
  }
}
