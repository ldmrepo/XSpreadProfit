// File Path: ./extractSymbol.js
// 기능 요약: JSON 데이터에서 symbols 배열의 symbol 값을 추출하고 출력
// Import: fs 모듈 사용하여 파일 읽기

const fs = require("fs")

const filePath = "./futuresResponse.json" // JSON 파일 경로를 설정하세요.
const filePath2 = "./futuresResponse2.json" // JSON 파일 경로를 설정하세요.

try {
    // JSON 파일 읽기
    const data = fs.readFileSync(filePath, "utf-8")
    const jsonData = JSON.parse(data)

    // symbols 배열에서 symbol 값 추출
    const symbols = jsonData.symbols.map((item) => item.symbol)

    fs.writeFileSync(filePath2, JSON.stringify(symbols, null, 2))

    console.log("Extracted Symbols:", symbols)
} catch (error) {
    console.error("Error reading or parsing the file:", error.message)
}
