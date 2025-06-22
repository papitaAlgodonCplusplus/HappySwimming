const fs = require('fs');
const path = require('path');

// Specify files and line numbers to toggle
const filesConfig = [
  {
    path: 'src/index.html',
    type: 'html',
    lines: {
      dev: [8],    // Line to uncomment for development
      prod: [11]   // Line to uncomment for production
    }
  },
  {
    path: 'server.js',
    type: 'code',
    sections: {
      dev: [33, 40],   // Development section: [startLine, endLine]
      prod: [43, 50]   // Production section: [startLine, endLine]
    }
  }
];

// Toggle HTML lines (comment/uncomment single lines)
function toggleHtmlLines(filePath, linesToUncomment, linesToComment) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.split('\n');

  // Uncomment specified lines
  linesToUncomment.forEach((lineNumber) => {
    const idx = lineNumber - 1;
    if (lines[idx].includes('<!--')) {
      lines[idx] = lines[idx].replace(/<!--\s*/, '').replace(/\s*-->/, '');
    }
  });

  // Comment specified lines
  linesToComment.forEach((lineNumber) => {
    const idx = lineNumber - 1;
    if (!lines[idx].includes('<!--')) {
      lines[idx] = `<!-- ${lines[idx]} -->`;
    }
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`Processed HTML file: ${filePath}`);
}

// Toggle JS/TS code sections by commenting/uncommenting JS-style comments
function toggleCodeSections(filePath, sectionToUncomment, sectionToComment) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.split('\n');

  if (filePath.endsWith('.html')) {
    // For TypeScript, use block comments
    lines[sectionToUncomment[0] - 1] = lines[sectionToUncomment[0] - 1].replace(/^\s*\/\*\s*/, '').replace(/\s*\*\/\s*$/, '');
    lines[sectionToUncomment[1] - 1] = lines[sectionToUncomment[1] - 1].replace(/^\s*\*\/\s*/, '');
  } else {
    for (let i = sectionToUncomment[0] - 1; i <= sectionToUncomment[1] - 1; i++) {
      if (lines[i].trim().startsWith('//')) {
        lines[i] = lines[i].replace(/^\s*\/\/\s*/, '');
      }
    }

    for (let i = sectionToComment[0] - 1; i <= sectionToComment[1] - 1; i++) {
      if (!lines[i].trim().startsWith('//')) {
        lines[i] = `// ${lines[i]}`;
      }
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`Processed code file: ${filePath}`);
}

// Main execution
const targetEnv = process.argv[2] || 'dev'; // 'dev' or 'prod'

if (!['dev', 'prod'].includes(targetEnv)) {
  console.error('Error: Invalid mode. Please use "dev" or "prod".');
  process.exit(1);
}

console.log(`Switching to ${targetEnv.toUpperCase()} mode...`);

filesConfig.forEach(({ path: filePath, type, lines, sections }) => {
  const fullPath = path.resolve(__dirname, filePath);
  if (fs.existsSync(fullPath)) {
    if (type === 'html' && lines) {
      console.log(`Processing HTML file: ${fullPath}`);
      if (targetEnv === 'dev') {
        toggleHtmlLines(fullPath, lines.dev, lines.prod);
      } else {
        toggleHtmlLines(fullPath, lines.prod, lines.dev);
      }
    } else if (type === 'code' && sections) {
      console.log(`Processing code file: ${fullPath}`);
      if (targetEnv === 'dev') {
        toggleCodeSections(fullPath, sections.dev, sections.prod);
      } else {
        toggleCodeSections(fullPath, sections.prod, sections.dev);
      }
    }
  } else {
    console.warn(`File not found: ${fullPath}`);
  }
});

console.log(`Successfully switched to ${targetEnv.toUpperCase()} mode.`);