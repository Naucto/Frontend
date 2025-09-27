export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: { '^.+\\.(css|less|gif|jpg|jpeg|svg|png)$': 'module.exports = {};', 'src/(.*)': '<rootDir>/src/$1' },
};
