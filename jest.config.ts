export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.app.json"
    }
  },
  moduleNameMapper: { "^.+\\.(css|less|gif|jpg|jpeg|svg|png)$": "module.exports = {};", "src/(.*)": "<rootDir>/src/$1" },
};
