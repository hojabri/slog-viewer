export interface WorkspaceConfiguration {
  get<T>(section: string, defaultValue?: T): T | undefined;
}

export const workspace = {
  getConfiguration: (): WorkspaceConfiguration => ({
    get: <T>(section: string, defaultValue?: T): T | undefined => defaultValue
  })
};
