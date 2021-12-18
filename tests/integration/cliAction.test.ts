import {readCommands, setInputsEnv} from "../utils/utils";
import {run} from "../../src/runner";
import './../utils/interceptStdout.d';
import interceptStdout from 'intercept-stdout'
import {performance} from "perf_hooks";
import * as dotenv from 'dotenv';
import ProcessEnv = NodeJS.ProcessEnv;

describe('js-eval-action', () => {
    let stdout = '';
    let originalEnv: ProcessEnv;

    interceptStdout(data => {
        stdout += data;
        return '';
    })

    beforeAll(() => {
        dotenv.config({path: 'tests.env'});
        originalEnv = {...process.env};
    })

    beforeEach(() => {
        stdout = '';
    });

    afterEach(() => {
        process.env = {...originalEnv};
    })

    it('simple math', async () => {
        setInputsEnv({
            expression: '3*(parseInt(inputs.x) + parseInt(inputs.y))',
            x: '5'
        });
        process.env.INPUT_Y = '2';
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '21'});
        expect(commands.errors).toEqual([]);
    });

    it('extract outputs', async () => {
        setInputsEnv({
            expression: '({o1: inputs.x.length, o2: {nested: inputs.y}})',
            extractOutputs: 'true',
            x: 'aa',
            y: 'bba'
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({o1: '2', o2: JSON.stringify({nested: 'bba'})});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('extract outputs failure', async () => {
        setInputsEnv({
            expression: '123',
            extractOutputs: 'true',
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.errors.length).toEqual(1);
        expect(commands.outputs).toEqual({});
        expect(process.exitCode).not.toEqual(0);
    });

    it('json inputs', async () => {
        setInputsEnv({
            expression: '3*(inputs.x + inputs.y) + inputs.z',
            extractOutputs: 'false',
            jsonInputs: 'x | y',
            x: '4',
            y: '2',
            z: '100'
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '18100'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('jsonInputs asterisk', async () => {
        setInputsEnv({
            expression: '3*(inputs.x.a + inputs.x.b) + inputs.z',
            extractOutputs: 'false',
            jsonInputs: '*',
            x: '{"a": 4, "b": 2}',
            z: '100'
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '118'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('json inputs failure', async () => {
        setInputsEnv({
            expression: 'inputs.x',
            extractOutputs: 'false',
            jsonInputs: '*',
            x: '.',
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.errors.length).toBeGreaterThan(0);
        expect(commands.outputs).toEqual({});
        expect(process.exitCode).not.toEqual(0);
    });

    it('expression failure', async () => {
        setInputsEnv({
            expression: '{{',
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.errors.length).toEqual(1);
        expect(commands.outputs).toEqual({});
        expect(process.exitCode).not.toEqual(0);
    });

    it('resolved promise expression', async () => {
        const startTime = performance.now();
        setInputsEnv({
            expression: 'new Promise((resolve, reject) => setTimeout(() => resolve(22), 50))',
        });
        await run();
        const endTime = performance.now();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '22'});
        expect(commands.errors).toEqual([]);
        expect(endTime-startTime).toBeGreaterThanOrEqual(50);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('rejected promise expression', async () => {
        const startTime = performance.now();
        setInputsEnv({
            expression: 'new Promise((resolve, reject) => setTimeout(() => reject(new Error("xxyy")), 50))',
        });
        await run();
        const endTime = performance.now();
        const commands = readCommands(stdout);
        expect(commands.errors.length).toEqual(1);
        expect(commands.errors[0].indexOf('xxyy')).not.toEqual(-1);
        expect(commands.outputs).toEqual({});
        expect(endTime-startTime).toBeGreaterThanOrEqual(50);
        expect(process.exitCode).not.toEqual(0);
    });

    it('env variables', async () => {
        process.env.XX_E = '45353';
        setInputsEnv({
            expression: 'env.XX_E',
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '45353'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('json envs', async () => {
        setInputsEnv({
            expression: '3*(env.ex + env.ey) + env.ez',
            extractOutputs: 'false',
            jsonEnvs: 'ex | ey',
        });
        process.env.ex = '4';
        process.env.ey = '2';
        process.env.ez = '100';
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '18100'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('jsonEnvs asterisk', async () => {
        setInputsEnv({
            expression: '3*(env.x.a + env.x.b) + env.z',
            extractOutputs: 'false',
            jsonEnvs: '*',
        });
        process.env.x = '{"a": 4, "b": 2}';
        process.env.z = '100';
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '118'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('json envs failure', async () => {
        setInputsEnv({
            expression: 'env.x',
            extractOutputs: 'false',
            jsonEnvs: '*',
        });
        process.env.x = '.';
        await run();
        const commands = readCommands(stdout);
        expect(commands.errors.length).toBeGreaterThan(0);
        expect(commands.outputs).toEqual({});
        expect(process.exitCode).not.toEqual(0);
    });

    it('octokit request', async () => {
        if (process.env.GITHUB_TOKEN) {
            setInputsEnv({
                expression:
                    '(await octokit.rest.repos.get({owner: context.repo.owner, repo: context.repo.repo})).data.name',
            });
            await run();
            const commands = readCommands(stdout);
            expect(commands.outputs).toEqual({result: 'js-eval-action'});
            expect(commands.errors).toEqual([]);
            expect([0, undefined]).toContain(process.exitCode);
        }
    });

    it('semver', async () => {
        setInputsEnv({
            expression:
                'semver.parse(inputs.x).compare(inputs.y)',
            x: '2.3.4',
            y: '2.5.6'
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: '-1'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it('yaml, fs, await', async () => {
        setInputsEnv({
            expression: 'yaml.parse((await fs.readFile("action.yml")).toString()).name'
        });
        await run();
        const commands = readCommands(stdout);
        expect(commands.outputs).toEqual({result: 'js-eval-action'});
        expect(commands.errors).toEqual([]);
        expect([0, undefined]).toContain(process.exitCode);
    });

    it("respect timeoutMs", async () => {
        setInputsEnv({
            expression: "new Promise(resolve => setTimeout(() => resolve(22), 1000))",
            timeoutMs: '50'
        });
        const startTime = performance.now();
        await run();
        const endTime = performance.now();
        expect(endTime-startTime).toBeLessThan(1000);
        expect(endTime-startTime).toBeGreaterThanOrEqual(50);
        expect(process.exitCode).not.toEqual(0);
    });

    it("timeout doesn't prevent to exit early", async () => {
        setInputsEnv({
            expression: "2",
            timeoutMs: '1000'
        });
        const startTime = performance.now();
        await run();
        const endTime = performance.now();
        expect(endTime-startTime).toBeLessThan(1000);
        expect([0, undefined]).toContain(process.exitCode);
    });
});