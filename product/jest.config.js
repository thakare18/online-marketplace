module.exports = {
	testEnvironment: 'node',
	coveragePathIgnorePatterns: ['/node_modules/'],
	testMatch: ['**/__tests__/**/*.test.js'],
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.model.js',
		'!src/db/**',
	],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50,
		},
	},
	setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
	testTimeout: 10000,
};
