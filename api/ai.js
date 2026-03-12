export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    const body = req.body;
    const action = body.action;
    
    // ⭐ 가장 안정적인 정식 모델 사용
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    let payload = {};

    try {
        if (action === 'polish' || action === 'generate' || action === 'insta') {
            let systemPrompt = "";
            let userPrompt = "";
            let isJson = false;
            let jsonSchema = {};

            if (action === 'polish') {
                systemPrompt = "당신은 배달 식당 사장님을 돕는 센스있는 마케터입니다. 사장님이 대충 적은 메모를 리뷰 답글용 문장으로 예쁘게 다듬어주세요.";
                userPrompt = `사장님 메모: "${body.text}"\n이것을 예쁘게 변환해주세요.`;
            } 
            else if (action === 'generate') {
                systemPrompt = `당신은 배달 앱 리뷰 답글을 전문적으로 작성하는 식당 사장님이자 리뷰 분석가입니다. [작성 원칙]을 준수하세요.`;
                userPrompt = `[분위기]: ${body.tone}\n[별점]: ${body.rating}점\n[고객 리뷰]:\n${body.reviewText}\n[추가 멘트]: ${body.extraInfo || ''}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        reply: { type: "STRING" }, customerType: { type: "STRING" }, sentiment: { type: "STRING" }, keywords: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            } 
            else if (action === 'insta') {
                systemPrompt = `당신은 수만 명의 팔로워를 보유한 지역 핫플 전문 인스타그램 마케터입니다. [작성 원칙]에 맞춰 모바일 화면에서 읽기 좋고 사람들의 발길을 이끄는 완벽한 원고와 지역 기반 해시태그를 기획해 주세요.`;
                userPrompt = `[업종]: ${body.businessType}\n[지역명]: ${body.locationName}\n[홍보 내용]:\n${body.promoContent}\n[글 분위기]: ${body.tone}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        caption: { type: "STRING" }, hashtags: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            }

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            };

            if (isJson) {
                payload.generationConfig = { responseMimeType: "application/json", responseSchema: jsonSchema };
            }

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error?.message || '구글 API 에러');

            const candidate = data.candidates?.[0];
            if (!candidate?.content) throw new Error("AI 응답 생성 실패");
            
            let resultText = candidate.content.parts?.[0]?.text;
            if (!resultText) throw new Error("AI 응답 형식이 올바르지 않습니다.");

            // ⭐ 핵심 에러 방어: AI가 멋대로 붙인 마크다운(```json 등) 찌꺼기 완벽 청소
            if (isJson) {
                resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
                return res.status(200).json({ result: JSON.parse(resultText) });
            } else {
                return res.status(200).json({ result: resultText });
            }
        }
        
        else if (action === 'banner') {
            let systemPrompt = `당신은 최고 수준의 현수막 시각 디자이너입니다. 우리는 '배경 이미지'와 '텍스트'를 따로 생성하여 웹에서 합성하는 방식을 사용합니다.
사용자의 요청을 분석하여, 배경을 그리기 위한 '영문 프롬프트'와 텍스트를 꾸미기 위한 '디자인 속성'을 JSON으로 반환하세요.

[작성 원칙]
1. bgPrompt: 배경 이미지를 생성할 프롬프트. ⭐반드시 100% 영어(English Only)로만 작성하세요! 한글은 절대 금지!⭐ 쉼표로 구분된 짧고 명확한 영어 키워드 10개 이내로 작성. 반드시 "no text, empty background, blank space"를 포함하여 글씨가 나오지 않게 할 것.
2. textColor: 배경과 대비되어 글씨가 잘 보일 Hex 색상 코드
3. fontType: 분위기에 맞는 폰트 ("Gowun Dodum", "Noto Sans KR", "Jua", "Nanum Pen Script" 중 택 1)
4. textShadow: 글씨 가독성을 높일 CSS 그림자 값
5. textAlign: 텍스트 정렬 방향 ("left", "center", "right" 중 택 1)
6. fontWeight: 글씨 굵기 ("400", "700", "900" 중 택 1)`;
            
            let userPrompt = `[행사 카테고리]: ${body.eventType}\n[현수막 문구]: ${body.bannerText}\n[분위기]: ${body.bannerVibe}\n[색상 톤]: ${body.bannerTone}`;
            let jsonSchema = {
                type: "OBJECT",
                properties: {
                    bgPrompt: { type: "STRING" }, textColor: { type: "STRING" }, fontType: { type: "STRING" }, textShadow: { type: "STRING" }, textAlign: { type: "STRING" }, fontWeight: { type: "STRING" }
                }
            };

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema }
            };

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error?.message || 'API 에러');
            
            const candidate = data.candidates?.[0];
            if (!candidate?.content) throw new Error("디자인 기획 생성 실패");
            
            let resultText = candidate.content.parts?.[0]?.text;
            if (!resultText) throw new Error("AI 응답 형식이 올바르지 않습니다.");

            // ⭐ 핵심 에러 방어: 마크다운 찌꺼기 완벽 청소 (이게 Vercel 500 에러의 주범이었습니다!)
            resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();

            return res.status(200).json({ result: JSON.parse(resultText) });
        } 
        else {
            return res.status(400).json({ error: '알 수 없는 요청입니다.' });
        }
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message || '서버 내부 오류' });
    }
}
