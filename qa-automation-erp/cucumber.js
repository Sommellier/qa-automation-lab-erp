module.exports = {
  default: {
    paths: [
      'features/**/*.feature'
    ],
    requireModule: [
      'tsx/cjs'
    ],
    require: [
      'src/support/CustomWorld.ts',
      'src/support/Hooks.ts',
      'src/step-definitions/**/*.ts'
    ],
    format: [
      'progress'
    ]
  }
};
