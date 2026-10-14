declare module 'papaparse' {
  interface ParseConfig {
    dynamicTyping?: boolean;
    skipEmptyLines?: boolean;
  }

  interface ParseResult<T> {
    data: T[];
  }

  const Papa: {
    parse<T>(input: string, config?: ParseConfig): ParseResult<T>;
    unparse(input: unknown[][]): string;
  };

  export default Papa;
}
