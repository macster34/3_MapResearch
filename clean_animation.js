const fs = require('fs');

// Read the current file
const filePath = 'src/components/Map/index.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Remove old animation state variables and functions
const patternsToRemove = [
  // Remove old animation state variables
  /const \[isAnimating, setIsAnimating\] = useState\(false\);/g,
  /const \[animationTime, setAnimationTime\] = useState\(null\);/g,
  /const \[animationRange, setAnimationRange\] = useState\(\[null, null\]\);/g,
  /const \[all311Features, setAll311Features\] = useState\(\[\]\);/g,
  /const animationTimerRef = useRef\(null\);/g,
  /const \[uniqueDays, setUniqueDays\] = useState\(\[\]\);/g,
  /const \[allDebrisFeatures, setAllDebrisFeatures\] = useState\(\[\]\);/g,
  /const \[showTreeDebris, setShowTreeDebris\] = useState\(false\);/g,
  /const \[outageCumulativeCounts, setOutageCumulativeCounts\] = useState\(\[\]\);/g,
  /const \[debrisCumulativeCounts, setDebrisCumulativeCounts\] = useState\(\[\]\);/g,
  /const \[outageDayToCount, setOutageDayToCount\] = useState\(\[\]\);/g,
  /const \[debrisDayToCount, setDebrisDayToCount\] = useState\(\[\]\);/g,
];

// Remove old animation useEffects (from line 720 to around line 1400)
const oldAnimationCode = content.substring(content.indexOf('// Load 311 calls GeoJSON for animation'), content.indexOf('useEffect(() => {'));
content = content.replace(oldAnimationCode, '');

// Remove references to old variables in LayerToggle props
content = content.replace(/showTreeDebris={showTreeDebris}\s+setShowTreeDebris={setShowTreeDebris}/g, '');

// Write the cleaned content back
fs.writeFileSync(filePath, content);
console.log('Cleaned old animation code from Map component'); 