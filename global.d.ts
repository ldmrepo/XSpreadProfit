// global.d.ts
declare namespace NodeJS {
    interface Global {
        __TEST_ENV__: string;
    }
}

declare var global: NodeJS.Global;
