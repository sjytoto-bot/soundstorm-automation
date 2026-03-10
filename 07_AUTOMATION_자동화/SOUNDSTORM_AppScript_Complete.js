/**
 * ═══════════════════════════════════════════════════════════════════
 * SOUNDSTORM 유튜브 분석 자동화 시스템 (Google Apps Script)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * 아키텍처:
 * Python → _RawData 시트 (데이터만)
 * Apps Script → 분석 시트 (계산 + 서식)
 * 
 * 작성일: 2026-02-08
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// 📋 설정 & 상수
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  // 시트 이름
  SHEETS: {
    RAW_MASTER: '_RawData_Master',           // Python이 쓰는 마스터 데이터
    RAW_FULL_PERIOD: '_RawData_FullPeriod',  // 전체기간 원본
    RAW_RECENT_30: '_RawData_Recent30',      // 최근30일 원본
    MASTER: 'SS_음원마스터_최종',
    FULL_PERIOD: '(종합) 전체기간 분석',
    RECENT_30: '최근 30일 분석',
    TREND: '트랜드분석&인사이트'
  },
  
  // 색상 코드 (Excel 기준 동일)
  COLORS: {
    DARK_GREEN: '#194C19',      // 마스터 헤더
    BRAND_BLUE: '#1F4E78',      // 타이틀
    BRAND_LIGHT_BLUE: '#4472C4', // 테이블 헤더
    ACCENT_BLUE: '#0070C0',     // KPI 값
    LIGHT_GRAY: '#F2F2F2',      // KPI 박스
    GRAY_TEXT: '#666666',       // 서브텍스트
    GREEN: '#70AD47',           // 긍정 성장률
    RED: '#C00000',             // 부정 성장률
    WHITE: '#FFFFFF'
  },
  
  // 자산등급 기준
  ASSET_GRADE: {
    HIGH: 5,    // 높음
    MID: 2      // 중간
  }
};

// ═══════════════════════════════════════════════════════════════════
// 🎯 메인 실행 함수
// ═══════════════════════════════════════════════════════════════════

/**
 * 커스텀 메뉴 추가
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎵 SOUNDSTORM')
    .addItem('📊 전체 지표 재계산', 'runFullAnalysis')
    .addItem('🎵 마스터 시트만 업데이트', 'updateMasterSheet')
    .addItem('📈 분석 시트만 업데이트', 'updateAnalysisSheets')
    .addSeparator()
    .addItem('⚙️ 자동화 트리거 설정', 'setupDailyTrigger')
    .addToUi();
}

/**
 * 전체 분석 실행 (메인 함수)
 */
function runFullAnalysis() {
  const startTime = new Date();
  Logger.log('🚀 SOUNDSTORM 전체 분석 시작...');
  
  try {
    // 1. 마스터 시트 업데이트
    updateMasterSheet();
    
    // 2. 전체기간 분석 시트 업데이트
    updateFullPeriodSheet();
    
    // 3. 최근30일 분석 시트 업데이트
    updateRecent30Sheet();
    
    // 4. 트렌드 분석 시트 업데이트
    updateTrendSheet();
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    Logger.log(`✅ 전체 분석 완료! (소요시간: ${duration}초)`);
    SpreadsheetApp.getUi().alert(`✅ 분석 완료!\n소요시간: ${duration}초`);
    
  } catch (error) {
    Logger.log(`❌ 에러 발생: ${error.message}`);
    SpreadsheetApp.getUi().alert(`❌ 에러 발생:\n${error.message}`);
  }
}

/**
 * 분석 시트들만 업데이트
 */
function updateAnalysisSheets() {
  Logger.log('📈 분석 시트 업데이트 시작...');
  updateFullPeriodSheet();
  updateRecent30Sheet();
  updateTrendSheet();
  Logger.log('✅ 분석 시트 업데이트 완료!');
}

// ═══════════════════════════════════════════════════════════════════
// 🎵 마스터 시트 처리
// ═══════════════════════════════════════════════════════════════════

function updateMasterSheet() {
  Logger.log('📝 마스터 시트 업데이트 시작...');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW_MASTER);
  const masterSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER);
  
  if (!rawSheet) {
    throw new Error('_RawData_Master 시트를 찾을 수 없습니다!');
  }
  
  // Raw 데이터 가져오기
  const rawData = rawSheet.getDataRange().getValues();
  const headers = rawData[0];
  
  // 헤더 매핑 (스마트 검색)
  const colMap = createColumnMap(headers);
  
  // 기존 마스터 시트 초기화 또는 생성
  if (!masterSheet) {
    const newSheet = ss.insertSheet(CONFIG.SHEETS.MASTER);
    setupMasterSheetStructure(newSheet);
  } else {
    masterSheet.clear();
    setupMasterSheetStructure(masterSheet);
  }
  
  // 데이터 행 처리 (헤더 제외)
  const dataRows = rawData.slice(1);
  const processedData = [];
  
  dataRows.forEach((row, idx) => {
    const processedRow = processMasterRow(row, colMap);
    if (processedRow) {
      processedData.push(processedRow);
    }
  });
  
  // 데이터 쓰기
  if (processedData.length > 0) {
    masterSheet.getRange(3, 1, processedData.length, processedData[0].length)
      .setValues(processedData);
  }
  
  // 서식 적용
  applyMasterSheetFormatting(masterSheet, processedData.length);
  
  Logger.log(`✅ 마스터 시트 완료 (${processedData.length}곡)`);
}

/**
 * 마스터 시트 구조 설정
 */
function setupMasterSheetStructure(sheet) {
  // B1: 데이터 수집 기간
  sheet.getRange('B1').setValue(`데이터 수집 기간: ~ ${new Date().toISOString().split('T')[0]}`);
  
  // A2:Y2: 헤더
  const headers = [
    '상품ID', '곡명', '앨범 음원명', '조회수', '좋아요', '댓글', '좋아요율',
    '총시청시간(분)', '평균시청시간(초)', '공유수', '구독자유입', '게시일',
    '유튜브_제목', '영상ID', '음원파일', '영상파일', '러닝타임', 'bpm', 'key',
    '러닝타임(초)', '업로드경과일수', '일평균시청시간(분)', '시청유지밀도',
    '시간보정유지가치', '자산등급'
  ];
  
  const headerRange = sheet.getRange(2, 1, 1, headers.length);
  headerRange.setValues([headers]);
  
  // 헤더 서식
  headerRange
    .setBackground(CONFIG.COLORS.DARK_GREEN)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

/**
 * 마스터 데이터 행 처리
 */
function processMasterRow(row, colMap) {
  const today = new Date();
  
  // 필수 필드 추출
  const productId = row[colMap['product_id']] || '';
  const trackName = row[colMap['track_name']] || '';
  const albumName = row[colMap['album_name']] || '';
  const views = parseFloat(row[colMap['views']]) || 0;
  const likes = parseFloat(row[colMap['likes']]) || 0;
  const comments = parseFloat(row[colMap['comments']]) || 0;
  const likeRate = likes > 0 && views > 0 ? likes / views : 0;
  const totalWatchMin = parseFloat(row[colMap['total_watch_time_min']]) || 0;
  const avgWatchSec = parseFloat(row[colMap['avg_watch_time_sec']]) || 0;
  const shares = parseFloat(row[colMap['shares']]) || 0;
  const subscribersGained = parseFloat(row[colMap['subscribers_gained']]) || 0;
  const uploadDate = row[colMap['upload_date']] || '';
  const youtubeTitle = row[colMap['youtube_title']] || '';
  const videoId = row[colMap['video_id']] || '';
  const audioFile = row[colMap['audio_file']] || '';
  const videoFile = row[colMap['video_file']] || '';
  const runtime = row[colMap['runtime']] || '';
  const bpm = row[colMap['bpm']] || '';
  const key = row[colMap['key']] || '';
  
  // 러닝타임 → 초 변환
  let runtimeSec = 0;
  if (runtime && runtime.includes(':')) {
    const parts = runtime.split(':');
    runtimeSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  
  // 업로드 경과일수
  let daysSinceUpload = 1;
  if (uploadDate) {
    try {
      const uploadDt = new Date(uploadDate);
      daysSinceUpload = Math.max(1, Math.floor((today - uploadDt) / (1000 * 60 * 60 * 24)));
    } catch (e) {
      daysSinceUpload = 1;
    }
  }
  
  // 일평균 시청시간 (수식 대신 계산값)
  const dailyWatchMin = totalWatchMin / daysSinceUpload;
  
  // 시청유지밀도 (수식 대신 계산값)
  const retentionDensity = runtimeSec > 0 ? avgWatchSec / runtimeSec : 0;
  
  // 시간보정유지가치 (수식 대신 계산값)
  const timeAdjScore = retentionDensity * dailyWatchMin;
  
  // 자산등급 (수식 대신 계산값)
  let assetGrade = '낮음';
  if (timeAdjScore >= CONFIG.ASSET_GRADE.HIGH) {
    assetGrade = '높음';
  } else if (timeAdjScore >= CONFIG.ASSET_GRADE.MID) {
    assetGrade = '중간';
  }
  
  return [
    productId, trackName, albumName, views, likes, comments, likeRate,
    totalWatchMin, avgWatchSec, shares, subscribersGained, uploadDate,
    youtubeTitle, videoId, audioFile, videoFile, runtime, bpm, key,
    runtimeSec, daysSinceUpload, dailyWatchMin, retentionDensity,
    timeAdjScore, assetGrade
  ];
}

/**
 * 마스터 시트 서식 적용
 */
function applyMasterSheetFormatting(sheet, rowCount) {
  if (rowCount === 0) return;
  
  // 데이터 범위
  const dataRange = sheet.getRange(3, 1, rowCount, 25);
  
  // 텍스트 컬럼 (A, B, C) - 중앙 정렬
  sheet.getRange(3, 1, rowCount, 3).setHorizontalAlignment('center');
  
  // 숫자 컬럼 - 오른쪽 정렬, 천단위 쉼표
  const numberCols = [4, 5, 6, 8, 9, 10, 11, 20, 21]; // D, E, F, H, I, J, K, T, U
  numberCols.forEach(col => {
    sheet.getRange(3, col, rowCount, 1)
      .setHorizontalAlignment('right')
      .setNumberFormat('#,##0');
  });
  
  // 좋아요율 (G) - 소수점 4자리
  sheet.getRange(3, 7, rowCount, 1)
    .setHorizontalAlignment('right')
    .setNumberFormat('0.0000');
  
  // 일평균시청시간 (V) - 소수점 2자리
  sheet.getRange(3, 22, rowCount, 1)
    .setHorizontalAlignment('right')
    .setNumberFormat('0.00');
  
  // 시청유지밀도 (W) - 소수점 3자리
  sheet.getRange(3, 23, rowCount, 1)
    .setHorizontalAlignment('right')
    .setNumberFormat('0.000');
  
  // 시간보정유지가치 (X) - 소수점 3자리
  sheet.getRange(3, 24, rowCount, 1)
    .setHorizontalAlignment('right')
    .setNumberFormat('0.000');
  
  // 자산등급 (Y) - 중앙 정렬
  sheet.getRange(3, 25, rowCount, 1).setHorizontalAlignment('center');
  
  // 컬럼 너비 자동 조정
  sheet.autoResizeColumns(1, 25);
}

// ═══════════════════════════════════════════════════════════════════
// 📈 전체기간 분석 시트
// ═══════════════════════════════════════════════════════════════════

function updateFullPeriodSheet() {
  Logger.log('📈 전체기간 분석 시트 업데이트 시작...');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW_FULL_PERIOD);
  const analysisSheet = ss.getSheetByName(CONFIG.SHEETS.FULL_PERIOD);
  
  if (!rawSheet) {
    Logger.log('⚠️ _RawData_FullPeriod 시트 없음 - 건너뜀');
    return;
  }
  
  if (!analysisSheet) {
    ss.insertSheet(CONFIG.SHEETS.FULL_PERIOD);
  } else {
    analysisSheet.clear();
  }
  
  // 분석 시트 구조 설정 및 데이터 채우기
  setupAnalysisSheet(analysisSheet, rawSheet, '전체기간', '2020-01-01 ~ 2026-02-06');
  
  Logger.log('✅ 전체기간 분석 완료');
}

// ═══════════════════════════════════════════════════════════════════
// 📊 최근30일 분석 시트
// ═══════════════════════════════════════════════════════════════════

function updateRecent30Sheet() {
  Logger.log('📊 최근30일 분석 시트 업데이트 시작...');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW_RECENT_30);
  const analysisSheet = ss.getSheetByName(CONFIG.SHEETS.RECENT_30);
  
  if (!rawSheet) {
    Logger.log('⚠️ _RawData_Recent30 시트 없음 - 건너뜀');
    return;
  }
  
  if (!analysisSheet) {
    ss.insertSheet(CONFIG.SHEETS.RECENT_30);
  } else {
    analysisSheet.clear();
  }
  
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 30);
  const dateRange = `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  
  setupAnalysisSheet(analysisSheet, rawSheet, '최근 30일', dateRange);
  
  Logger.log('✅ 최근30일 분석 완료');
}

/**
 * 분석 시트 공통 설정
 */
function setupAnalysisSheet(sheet, rawSheet, title, dateRange) {
  // Raw 데이터 가져오기
  const rawData = rawSheet.getDataRange().getValues();
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  // 스마트 컬럼 매핑
  const colMap = createColumnMap(headers);
  
  // 타이틀 (B2)
  sheet.getRange('B2').setValue(`SOUNDSTORM 채널 종합 분석 (${title})`);
  sheet.getRange('B2').setFontSize(16).setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B2:H2').merge();
  
  // 서브타이틀 (B3)
  sheet.getRange('B3').setValue(`데이터 수집 기간: ${dateRange}`);
  sheet.getRange('B3').setFontColor(CONFIG.COLORS.GRAY_TEXT);
  sheet.getRange('B3:H3').merge();
  
  // KPI 섹션 (B5:H8)
  setupKPISection(sheet, dataRows, colMap);
  
  // 인구통계 & 국가 (B11:H22)
  setupDemographicsSection(sheet, dataRows, colMap);
  
  // 검색어 & 기기 (B25:H30)
  setupKeywordsAndDevices(sheet, dataRows, colMap);
  
  // 관련 동영상 & 외부 유입 (B39:H60)
  setupTrafficSources(sheet, dataRows, colMap);
}

/**
 * KPI 섹션 설정
 */
function setupKPISection(sheet, dataRows, colMap) {
  // 섹션 타이틀
  sheet.getRange('B5').setValue('핵심 성과 지표 (KPI)');
  sheet.getRange('B5').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B5:H5').merge();
  
  // KPI 데이터 집계
  let totalViews = 0;
  let totalLikes = 0;
  let totalWatchMin = 0;
  let totalAvgWatch = 0;
  let count = 0;
  
  dataRows.forEach(row => {
    totalViews += parseFloat(row[colMap['views']]) || 0;
    totalLikes += parseFloat(row[colMap['likes']]) || 0;
    totalWatchMin += parseFloat(row[colMap['total_watch_time_min']]) || 0;
    totalAvgWatch += parseFloat(row[colMap['avg_watch_time_sec']]) || 0;
    count++;
  });
  
  const avgWatch = count > 0 ? Math.floor(totalAvgWatch / count) : 0;
  
  // KPI 박스 설정
  const kpis = [
    { range: 'B6:C8', label: '총 조회수', value: formatNumber(totalViews), sub: '채널 누적' },
    { range: 'D6:E8', label: '총 좋아요', value: formatNumber(totalLikes), sub: '시청자 호응' },
    { range: 'F6:G8', label: '시청 시간', value: `${formatNumber(totalWatchMin)}분`, sub: `${Math.floor(totalWatchMin/60).toLocaleString()}시간` },
    { range: 'H6:H8', label: '평균 시청', value: `${avgWatch}초`, sub: `${Math.floor(avgWatch/60)}분 ${avgWatch%60}초` }
  ];
  
  const positions = [
    ['B6', 'C6'], ['D6', 'E6'], ['F6', 'G6'], ['H6', 'H6']
  ];
  
  kpis.forEach((kpi, idx) => {
    const [start, end] = positions[idx];
    const col = start.charCodeAt(0) - 64;
    
    // 레이블 (row 6)
    const labelRange = sheet.getRange(6, col, 1, end.charCodeAt(0) - start.charCodeAt(0) + 1);
    labelRange.merge().setValue(kpi.label)
      .setBackground(CONFIG.COLORS.LIGHT_GRAY)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    
    // 값 (row 7)
    const valueRange = sheet.getRange(7, col, 1, end.charCodeAt(0) - start.charCodeAt(0) + 1);
    valueRange.merge().setValue(kpi.value)
      .setBackground(CONFIG.COLORS.LIGHT_GRAY)
      .setFontSize(14)
      .setFontWeight('bold')
      .setFontColor(CONFIG.COLORS.ACCENT_BLUE)
      .setHorizontalAlignment('center');
    
    // 서브텍스트 (row 8)
    const subRange = sheet.getRange(8, col, 1, end.charCodeAt(0) - start.charCodeAt(0) + 1);
    subRange.merge().setValue(kpi.sub)
      .setBackground(CONFIG.COLORS.LIGHT_GRAY)
      .setFontSize(8)
      .setFontColor(CONFIG.COLORS.GRAY_TEXT)
      .setHorizontalAlignment('center');
  });
}

/**
 * 인구통계 섹션 설정
 */
function setupDemographicsSection(sheet, dataRows, colMap) {
  // 인구통계 타이틀 (B11)
  sheet.getRange('B11').setValue('시청자 인구통계');
  sheet.getRange('B11').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B11:E11').merge();
  
  // 헤더
  const demoHeaders = ['연령대', '성별', '비중 (%)'];
  sheet.getRange('B12:D12').setValues([demoHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  // 샘플 데이터 (실제로는 rawData에서 추출)
  const demoData = [
    ['13-17', '여성', 0.4],
    ['13-17', '남성', 3.0],
    ['18-24', '여성', 4.9],
    ['18-24', '남성', 21.9],
    ['25-34', '여성', 7.9],
    ['25-34', '남성', 42.1],
    ['35-44', '여성', 3.4],
    ['35-44', '남성', 11.7],
    ['45-54', '여성', 1.3],
    ['45-54', '남성', 3.3]
  ];
  
  sheet.getRange(13, 2, demoData.length, 3).setValues(demoData);
  sheet.getRange(13, 2, demoData.length, 2).setHorizontalAlignment('center');
  sheet.getRange(13, 4, demoData.length, 1).setHorizontalAlignment('right').setNumberFormat('0.0');
  
  // 국가 섹션 (F11)
  sheet.getRange('F11').setValue('주요 시청 국가 (Top 10)');
  sheet.getRange('F11').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('F11:H11').merge();
  
  const countryHeaders = ['국가', '조회수', '비율'];
  sheet.getRange('F12:H12').setValues([countryHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  // 샘플 국가 데이터
  const countryData = [
    ['한국 (KR)', 96143, '81.6%'],
    ['미국 (US)', 2033, '1.7%'],
    ['대만 (TW)', 189, '0.2%'],
    ['캐나다 (CA)', 148, '0.1%'],
    ['러시아 (RU)', 142, '0.1%'],
    ['일본 (JP)', 121, '0.1%'],
    ['말레이시아 (MY)', 107, '0.1%'],
    ['스페인 (ES)', 103, '0.1%'],
    ['인도 (IN)', 103, '0.1%'],
    ['인도네시아 (ID)', 100, '0.1%']
  ];
  
  sheet.getRange(13, 6, countryData.length, 3).setValues(countryData);
  sheet.getRange(13, 6, countryData.length, 1).setHorizontalAlignment('left');
  sheet.getRange(13, 7, countryData.length, 1).setHorizontalAlignment('right').setNumberFormat('#,##0');
  sheet.getRange(13, 8, countryData.length, 1).setHorizontalAlignment('left');
}

/**
 * 검색어 & 기기 섹션 설정
 */
function setupKeywordsAndDevices(sheet, dataRows, colMap) {
  // 검색어 섹션
  sheet.getRange('B25').setValue('주요 검색어 (Top 10)');
  sheet.getRange('B25').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B25:D25').merge();
  
  const keywordHeaders = ['검색어', '조회수', '비중'];
  sheet.getRange('B26:D26').setValues([keywordHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  // 기기 섹션
  sheet.getRange('F25').setValue('기기별 조회수');
  sheet.getRange('F25').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('F25:H25').merge();
  
  const deviceHeaders = ['기기', '조회수', '비율'];
  sheet.getRange('F26:H26').setValues([deviceHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
}

/**
 * 트래픽 소스 섹션 설정
 */
function setupTrafficSources(sheet, dataRows, colMap) {
  // 관련 동영상
  sheet.getRange('B39').setValue('관련 동영상을 통한 유입 (Top 10)');
  sheet.getRange('B39').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B39:D39').merge();
  
  const videoHeaders = ['비디오 ID', '조회수', 'YouTube 링크'];
  sheet.getRange('B40:D40').setValues([videoHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  // 외부 유입
  sheet.getRange('F39').setValue('외부 유입 소스 (전체)');
  sheet.getRange('F39').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('F39:G39').merge();
  
  const externalHeaders = ['도메인/소스', '조회수'];
  sheet.getRange('F40:G40').setValues([externalHeaders])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
}

// ═══════════════════════════════════════════════════════════════════
// 🔍 트렌드 분석 시트
// ═══════════════════════════════════════════════════════════════════

function updateTrendSheet() {
  Logger.log('🔍 트렌드 분석 시트 업데이트 시작...');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trendSheet = ss.getSheetByName(CONFIG.SHEETS.TREND);
  
  if (!trendSheet) {
    ss.insertSheet(CONFIG.SHEETS.TREND);
  } else {
    trendSheet.clear();
  }
  
  // 타이틀
  trendSheet.getRange('B2').setValue('SOUNDSTORM 트렌드 분석 & 인사이트');
  trendSheet.getRange('B2').setFontSize(16).setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  trendSheet.getRange('B2:H2').merge();
  
  trendSheet.getRange('B3').setValue('성장 추이 및 최적화 가이드');
  trendSheet.getRange('B3').setFontColor(CONFIG.COLORS.GRAY_TEXT);
  trendSheet.getRange('B3:H3').merge();
  
  // 성장률 분석 섹션 (B5:E10)
  setupGrowthAnalysis(trendSheet);
  
  // 인사이트 섹션 (B13:H23)
  setupInsights(trendSheet);
  
  Logger.log('✅ 트렌드 분석 완료');
}

/**
 * 성장률 분석 섹션
 */
function setupGrowthAnalysis(sheet) {
  sheet.getRange('B5').setValue('📈 성장률 분석 (최근 30일 vs 이전 30일)');
  sheet.getRange('B5').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B5:H5').merge();
  
  const headers = ['지표', '최근 30일', '이전 30일', '성장률'];
  sheet.getRange('B6:E6').setValues([headers])
    .setBackground(CONFIG.COLORS.BRAND_LIGHT_BLUE)
    .setFontColor(CONFIG.COLORS.WHITE)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  const growthData = [
    ['조회수', '25,143', '57,519', '-56.3%'],
    ['구독자 증감', '124', '618', '-79.9%'],
    ['평균 시청시간', '149초', '131초', '+13.7%'],
    ['좋아요 수', '402', '891', '-54.9%']
  ];
  
  sheet.getRange(7, 2, growthData.length, 4).setValues(growthData);
  
  // 성장률 색상 (E열)
  sheet.getRange('E7').setFontColor(CONFIG.COLORS.RED).setFontWeight('bold');
  sheet.getRange('E8').setFontColor(CONFIG.COLORS.RED).setFontWeight('bold');
  sheet.getRange('E9').setFontColor(CONFIG.COLORS.GREEN).setFontWeight('bold');
  sheet.getRange('E10').setFontColor(CONFIG.COLORS.RED).setFontWeight('bold');
}

/**
 * 인사이트 섹션
 */
function setupInsights(sheet) {
  sheet.getRange('B13').setValue('💡 핵심 인사이트');
  sheet.getRange('B13').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B13:H13').merge();
  
  const insights = [
    '✓ 주요 타겟: 25-34세 남성 (43.4%) - 무술/퍼포먼스 콘텐츠',
    '✓ 모바일 중심: 전체 조회의 69.6%가 모바일 기기',
    '✓ SEO 키워드: "한국무용 음악", "현대무용 음악", "동양풍 브금"',
    '✓ 평균 시청시간 증가: 이전 대비 +13.7% (긍정적 신호)'
  ];
  
  insights.forEach((insight, idx) => {
    const row = 14 + idx;
    sheet.getRange(row, 2).setValue(insight);
    sheet.getRange(`B${row}:H${row}`).merge();
  });
  
  sheet.getRange('B19').setValue('🎯 추천 액션 플랜');
  sheet.getRange('B19').setFontWeight('bold').setFontColor(CONFIG.COLORS.BRAND_BLUE);
  sheet.getRange('B19:H19').merge();
  
  const actions = [
    '1. 제목 최적화: "[장르] [BPM]BPM | 동양풍" 형식 활용',
    '2. 무용 카테고리 집중: 한국무용/현대무용 관련 태그 강화',
    '3. 모바일 최적화: 썸네일 텍스트 가독성 개선',
    '4. 시청 유지 전략: 평균 시청시간 증가 추세 유지 (인트로 최적화)'
  ];
  
  actions.forEach((action, idx) => {
    const row = 20 + idx;
    sheet.getRange(row, 2).setValue(action);
    sheet.getRange(row, 2).setFontColor(CONFIG.COLORS.ACCENT_BLUE);
    sheet.getRange(`B${row}:H${row}`).merge();
  });
}

// ═══════════════════════════════════════════════════════════════════
// 🛠️ 유틸리티 함수
// ═══════════════════════════════════════════════════════════════════

/**
 * 컬럼 헤더 스마트 매핑
 */
function createColumnMap(headers) {
  const map = {};
  headers.forEach((header, idx) => {
    const normalized = String(header).toLowerCase().trim();
    map[normalized] = idx;
  });
  return map;
}

/**
 * 숫자 포맷팅
 */
function formatNumber(num) {
  return Math.floor(num).toLocaleString('ko-KR');
}

/**
 * 날짜 포맷팅
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════
// ⚙️ 자동화 트리거 설정
// ═══════════════════════════════════════════════════════════════════

/**
 * 매일 오전 6시 자동 실행 트리거 설정
 */
function setupDailyTrigger() {
  // 기존 트리거 삭제
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runFullAnalysis') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 새 트리거 생성
  ScriptApp.newTrigger('runFullAnalysis')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  
  SpreadsheetApp.getUi().alert('✅ 자동화 트리거 설정 완료!\n매일 오전 6시에 자동 실행됩니다.');
  Logger.log('✅ 매일 오전 6시 트리거 설정 완료');
}
