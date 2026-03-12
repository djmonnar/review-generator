export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    // 프론트엔드에서 보낸 데이터 받기
    const { action, text, rating, tone, reviewText, extraInfo, businessType, locationName, promoContent } = req.body;
    
    let systemPrompt = "";
    let userPrompt = "";
    let isJson = false;
    let jsonSchema = {};

    // ==========================================
    // 1. 배민 리뷰 자동 생성기 로직 (기존 유지)
    // ==========================================
    if (action === 'polish') {
        systemPrompt = "당신은 배달 식당 사장님을 돕는 센스있는 마케터입니다. 사장님이 대충 적은 메모를 리뷰 답글용 문장으로 예쁘게 다듬어주세요.";
        userPrompt = `사장님 메모: "${text}"\n이것을 예쁘게 변환해주세요.`;
    } 
    else if (action === 'generate') {
        systemPrompt = `당신은 배달 앱 리뷰 답글을 전문적으로 작성하는 식당 사장님이자, 리뷰 분석가입니다. [작성 원칙]을 준수하세요.`;
        userPrompt = `[분위기]: ${tone}\n[별점]: ${rating}점\n[고객 리뷰]:\n${reviewText}\n[추가 멘트]: ${extraInfo || ''}`;
        isJson = true;
        jsonSchema = {
            type: "OBJECT",
            properties: {
                reply: { type: "STRING" },
                customerType: { type: "STRING" },
                sentiment: { type: "STRING" },
                keywords: { type: "ARRAY", items: { type: "STRING" } }
            }
        };
    } 
    // ==========================================
    // 2. [NEW] 인스타 원고 생성기 로직 추가
    // ==========================================
    else if (action === 'insta') {
        systemPrompt = `당신은 수만 명의 팔로워를 보유한 지역 맛집/핫플 전문 인스타그램 마케터입니다. 
사장님이 제공한 [업종], [지역명], [홍보 내용]을 바탕으로, 모바일 화면에서 읽기 좋고 사람들의 발길을 이끄는 완벽한 인스타그램 게시글 원고와 해시태그를 기획해 주세요.

[작성 원칙 - 본문 (caption)]
1. 톤앤매너: 사용자가 요청한 [글 분위기]에 완벽하게 맞춰서 작성할 것.
2. 후킹(Hooking): 첫 줄은 스크롤을 멈추게 하는 시선을 끄는 강력한 문장으로 시작할 것.
3. 가독성: 인스타그램 특유의 줄바꿈(엔터)과 여백을 적절히 활용하여 답답해 보이지 않게 작성할 것.
4. 이모지: 문맥에 맞는 이모지를 센스 있게 적절히 배치할 것.
5. 행동 유도(CTA): 글 마지막에는 "저장해두고 방문하세요", "친구 태그하고 같이 가자!", "프로필 링크에서 예약하기" 등 고객의 행동을 유도하는 멘트를 넣을 것.

[작성 원칙 - 해시태그 (hashtags)]
1. 철저하게 [지역명]과 [업종]을 결합한 지역 기반 로컬 해시태그 위주로 15~20개를 추출할 것.
2. 예시: 지역명이 '강남역'이고 업종이 '고깃집'일 경우 -> #강남역맛집 #강남역고기집 #강남역회식장소 #강남역데이트 #강남맛집추천 #강남역핫플 등
3. 각 해시태그는 반드시 '#' 기호를 포함할 것.`;

        userPrompt = `[매장 업종]: ${businessType}\n[매장 위치(지역명)]: ${locationName}\n[오늘 알리고 싶은 홍보 내용]:\n${promoContent}\n[원하는 글 분위기]: ${tone}`;
        isJson = true;
        jsonSchema = {
            type: "OBJECT",
            properties: {
                caption: { type: "STRING", description: "작성된 인스타그램 본문 원고 (줄바꿈 포함)" },
                hashtags: { type: "ARRAY", items: { type: "STRING" }, description: "15~20개의 추천 해시태그 배열 (예: ['#강남맛집', '#강남역카페'])" }
            }
        };
    } 
    else {
        return res.status(400).json({ error: '잘못된 요청(액션)입니다.' });
    }

    // 구글 Gemini API 통신
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    let payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    if (isJson) {
        payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || '구글 API 서버 에러');
        }

        const resultText = data.candidates[0].content.parts[0].text;
        
        if (isJson) {
            res.status(200).json({ result: JSON.parse(resultText) });
        } else {
            res.status(200).json({ result: resultText });
        }

    } catch (error) {
        console.error('API 통신 에러:', error);
        res.status(500).json({ error: error.message || 'AI 서버와 통신 중 문제가 발생했습니다.' });
    }
}
