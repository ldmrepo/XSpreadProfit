// jest.config.js
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"], // 이 부분이 문제
};
