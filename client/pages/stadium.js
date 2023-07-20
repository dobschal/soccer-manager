export async function renderStadiumPage () {
  return `
    <div class="stadium-wrapper">
      <div class="stadium-canvas">
        <div class="scene">        
          <div class="floor"></div>
          <div class="green-field"></div>
          <div class="stands">
            <div class="stand-wrapper big"> <!-- north -->
              <div class="roof"></div>
              <div class="stand"></div>
              <div class="rightwall-stand"></div>
              <div class="leftwall-stand"></div>
              <div class="backwall-stand"></div>          
            </div>
            <div class="stand-wrapper big"> <!-- south -->
              <div class="roof"></div>
              <div class="stand"></div>
              <div class="rightwall-stand"></div>
              <div class="leftwall-stand"></div>
              <div class="backwall-stand"></div>          
            </div>
            <div class="stand-wrapper big"> <!-- west -->
              <div class="roof"></div>
              <div class="stand"></div>
              <div class="rightwall-stand"></div>
              <div class="leftwall-stand"></div>
              <div class="backwall-stand"></div>          
            </div>
            <div class="stand-wrapper big"> <!-- east -->
              <div class="roof"></div>
              <div class="stand"></div>
              <div class="rightwall-stand"></div>
              <div class="leftwall-stand"></div>
              <div class="backwall-stand"></div>          
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}
