// tests/setup.ts
// Jest 실행 전 설정을 정의하는 파일

// 예: 글로벌 변수 설정
// tests/setup.ts
// import chai from "chai";
// import sinonChai from "sinon-chai";

// chai.use(sinonChai);

// jest.setTimeout(30000);

(globalThis as any).__TEST_ENV__ = "test";
