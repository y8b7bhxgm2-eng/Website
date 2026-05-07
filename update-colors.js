import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.css')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace colors with greys/monochrome
  content = content.replace(/#ff5252/gi, '#666666');
  content = content.replace(/255, 82, 82/g, '102, 102, 102');
  
  content = content.replace(/#ff7373/gi, '#888888');
  content = content.replace(/255, 115, 115/g, '136, 136, 136');
  
  content = content.replace(/#5fe27e/gi, '#dddddd');
  content = content.replace(/95, 226, 126/g, '221, 221, 221');
  
  content = content.replace(/#7c8cff/gi, '#cccccc');
  content = content.replace(/124, 140, 255/g, '204, 204, 204');
  
  content = content.replace(/#5ad6c5/gi, '#bbbbbb');
  content = content.replace(/90, 214, 197/g, '187, 187, 187');
  
  content = content.replace(/#f0c674/gi, '#aaaaaa');
  content = content.replace(/240, 198, 116/g, '170, 170, 170');
  
  content = content.replace(/#a78bfa/gi, '#999999');
  content = content.replace(/167, 139, 250/g, '153, 153, 153');

  // Fix the clipped dome warning light
  if (file.endsWith('index.css')) {
    content = content.replace(
      /background: radial-gradient\(ellipse at 50% 100%, #666666, rgba\(102, 102, 102, 0\) 70%\);\s*border-radius: 14px 14px 6px 6px;\s*filter: drop-shadow\(0 0 14px rgba\(102, 102, 102, 0\.5\)\);/g,
      'background: #666666;\n  border-radius: 50%;\n  box-shadow: 0 0 14px 4px rgba(102, 102, 102, 0.5);'
    );
    // the previous line was for already replaced content, but let's just do a specific match for the warning light block
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
  }
});
console.log('Colors replaced');
