#!/bin/bash
set -e

mkdir -p client/vendor/three/addons/controls \
         client/vendor/chart.js/auto \
         client/vendor/chart.js/dist \
         client/vendor/@kurkle

cp node_modules/three/build/three.module.js \
   node_modules/three/build/three.core.js \
   client/vendor/three/

cp node_modules/three/examples/jsm/controls/OrbitControls.js \
   client/vendor/three/addons/controls/

cp node_modules/chart.js/auto/auto.js \
   client/vendor/chart.js/auto/

cp node_modules/chart.js/dist/chart.js \
   client/vendor/chart.js/dist/

cp -r node_modules/chart.js/dist/chunks \
   client/vendor/chart.js/dist/

cp node_modules/@kurkle/color/dist/color.esm.js \
   client/vendor/@kurkle/
