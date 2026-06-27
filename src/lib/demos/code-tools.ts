import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import * as v from 'valibot';

const allowed = /^[\d\s+\-*/%().]+$/;

class Parser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse() {
    const value = this.expression();
    this.space();
    if (this.index < this.source.length) throw new Error(`unexpected token at ${this.index}`);
    return value;
  }

  private expression() {
    let value = this.term();
    while (true) {
      this.space();
      if (this.take('+')) value += this.term();
      else if (this.take('-')) value -= this.term();
      else return value;
    }
  }

  private term() {
    let value = this.factor();
    while (true) {
      this.space();
      if (this.take('*')) value *= this.factor();
      else if (this.take('/')) value /= this.factor();
      else if (this.take('%')) value %= this.factor();
      else return value;
    }
  }

  private factor(): number {
    this.space();
    if (this.take('+')) return this.factor();
    if (this.take('-')) return -this.factor();
    if (this.take('(')) {
      const value = this.expression();
      this.space();
      if (!this.take(')')) throw new Error('missing closing parenthesis');
      return value;
    }
    return this.number();
  }

  private number() {
    this.space();
    const start = this.index;
    while (/[0-9.]/.test(this.source[this.index] ?? '')) this.index += 1;
    if (start === this.index) throw new Error(`number expected at ${this.index}`);
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error('invalid number');
    return value;
  }

  private take(char: string) {
    if (this.source[this.index] === char) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private space() {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1;
  }
}

function safeEvaluateExpression(source: string) {
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 2_000) throw new Error('source must be 1-2000 characters');
  const expression = trimmed.replace(/;$/, '');
  if (!allowed.test(expression)) throw new Error('safe fallback only supports numeric arithmetic expressions');
  try {
    return { value: new Parser(expression).parse(), mode: 'safe-arithmetic-parser' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), mode: 'safe-arithmetic-parser' };
  }
}

export function makeCodeModeTools() {
  const runShortJs = defineTool({
    name: 'run_short_js',
    description: 'Run a short deterministic JavaScript arithmetic expression. Cloudflare Dynamic Worker APIs are not exposed in this runtime, so this uses a constrained parser fallback and rejects general JavaScript.',
    input: v.object({ source: v.string() }),
    run: ({ input }) => {
      const result = safeEvaluateExpression(input.source);
      return {
        ...result,
        limitation: '@flue/runtime 1.0.0-beta.6 does not expose a Dynamic Worker/code-mode API. This demo uses a constrained expression fallback for short deterministic snippets.',
      } as unknown as JsonValue;
    },
  });
  return [runShortJs];
}
