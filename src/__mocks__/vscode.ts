export interface WorkspaceConfiguration {
  get<T>(section: string, defaultValue?: T): T | undefined;
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}

export const workspace = {
  getConfiguration: (): WorkspaceConfiguration => ({
    get: <T>(section: string, defaultValue?: T): T | undefined => defaultValue
  }),
  workspaceFolders: undefined as any
};

export const window = {
  activeTextEditor: undefined as any
};

export const tasks = {
  registerTaskProvider: (_type: string, _provider: any) => ({ dispose: () => {} })
};

export class CustomExecution {
  constructor(public callback: () => Thenable<any>) {}
}

export class Task {
  constructor(
    public definition: any,
    public scope: any,
    public name: string,
    public source: string,
    public execution?: any
  ) {}
}

export enum TaskScope {
  Global = 1,
  Workspace = 2
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' })
};
