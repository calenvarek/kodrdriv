import { describe, it, expect } from 'vitest';
import { ArgumentError } from '../../src/error/ArgumentError';

describe('ArgumentError', () => {
    it('should create an ArgumentError with the correct name and message', () => {
        const argumentName = 'testArg';
        const message = 'Invalid argument value';
        const error = new ArgumentError(argumentName, message);

        expect(error.name).toBe('ArgumentError');
        expect(error.message).toBe(message);
        expect(error.argument).toBe(argumentName);
    });

    it('should allow access to the argument name through the argument property', () => {
        const argumentName = 'config';
        const error = new ArgumentError(argumentName, 'Configuration is invalid');

        expect(error.argument).toBe(argumentName);
    });

    it('should create an ArgumentError with a different argument name and message', () => {
        const argumentName = 'options';
        const message = 'Missing required options';
        const error = new ArgumentError(argumentName, message);

        expect(error.name).toBe('ArgumentError');
        expect(error.message).toBe(message);
        expect(error.argument).toBe(argumentName);
    });
});
