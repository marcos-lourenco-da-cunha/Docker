import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Terminal } from 'vscode';
import { ext } from '../../extensionVariables';

export interface ITerminalProvider {
  createTerminal(name: string): Terminal;
}

export class DefaultTerminalProvider {
  public createTerminal(name: string): Terminal {
    let terminalOptions: vscode.TerminalOptions = {};
    terminalOptions.name = name;
    const value: string = vscode.workspace.getConfiguration("docker").get("host", "");
    if (value) {
      terminalOptions.env = {
        DOCKER_HOST: value
      };
    }
    return vscode.window.createTerminal(terminalOptions);
  }
}

export class TestTerminalProvider {
  private _currentTerminal: TestTerminal;

  public createTerminal(name: string): Terminal {
    let terminal = new DefaultTerminalProvider().createTerminal(name);
    let testTerminal = new TestTerminal(terminal);
    this._currentTerminal = testTerminal;
    return testTerminal;
  }

  public get currentTerminal(): TestTerminal {
    return this._currentTerminal;
  }
}

class TestTerminal implements vscode.Terminal {
  private _outputFilePath: string;
  private _errFilePath: string;
  private _semaphorePath: string;
  private _suffix: number;
  private static _lastSuffix: number = 1;

  constructor(private _terminal: vscode.Terminal) {
    let root = vscode.workspace.rootPath || os.tmpdir();
    this._suffix = TestTerminal._lastSuffix++;

    this._outputFilePath = path.join(root, `.out${this._suffix}`);
    this._errFilePath = path.join(root, `.err${this._suffix}`);
    this._semaphorePath = path.join(root, `.sem${this._suffix}`);
  }

  public get name(): string { return this._terminal.name; }

  public get processId(): Thenable<number> { return this._terminal.processId; }

  public async exit(): Promise<{ errorText: string, outputText: string }> {
    let pid = await this._terminal.processId;

    this.sendTextRaw(`echo Done > ${this._semaphorePath}`);

    await this.waitForFileCreation(this._semaphorePath);

    assert(fse.existsSync(this._outputFilePath), 'The output file from the command was not created.');
    let output = fse.readFileSync(this._outputFilePath).toString();

    assert(fse.existsSync(this._errFilePath), 'The error file from the command was not created.');
    let err = fse.readFileSync(this._errFilePath).toString();

    return { outputText: output, errorText: err };
  }

  private async waitForFileCreation(filePath: string): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      let timer = setInterval(
        () => {
          if (fse.existsSync(filePath)) {
            clearInterval(timer);
            resolve();
          }
        }, 500);
    });
  }

  public sendText(text: string, addNewLine?: boolean): void {
    if (addNewLine !== false) {
      text += ` >${this._outputFilePath} 2>${this._errFilePath}`;
    }
    this.sendTextRaw(text, addNewLine);
  }

  private sendTextRaw(text: string, addNewLine?: boolean): void {
    this._terminal.sendText(text, addNewLine);
  }

  public show(preserveFocus?: boolean): void {
    this._terminal.show(preserveFocus);
  }

  public hide(): void {
    this._terminal.hide();
  }

  public dispose(): void {
    this._terminal.dispose();
  }
}
