/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    moduleDirectories: ["node_modules", "src"],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    roots: ["<rootDir>/src", "<rootDir>/tests"],
    testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.spec.ts"],
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    verbose: true,
    testTimeout: 30000,
    setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
};
