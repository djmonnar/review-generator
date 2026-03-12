export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });

    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) return res.status(500).json({ error: 'Vercel 서버에 구글 API 키가 없습니다!' });

    const body = req.body || {};
    const action = body.action;
    
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    let payload = {};

    try {
        // [1] 배민 리뷰 / 인스타 (기존과 동일)
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
            
            if (!response.ok) throw new Error(`구글 API 오류: ${data.error?.message}`);

            const candidate = data.candidates?.[0];
            if (!candidate?.content) throw new Error("AI 응답이 차단되었습니다.");
            
            let resultText = candidate.content.parts?.[0]?.text;
            if (!resultText) throw new Error("AI 응답이 비어있습니다.");

            if (isJson) {
                resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
                return res.status(200).json({ result: JSON.parse(resultText) });
            } else {
                return res.status(200).json({ result: resultText });
            }
        }
        
        // [2] 현수막 Step 1: 기획하기 (이미지 우회 요청을 빼고 프론트로 다시 넘깁니다)
        else if (action === 'banner') {
            let systemPrompt = `당신은 최고 수준의 현수막 시각 디자이너입니다. 우리는 '배경 이미지'와 '텍스트'를 따로 생성하여 합성합니다.

[작성 원칙]
1. bgPrompt: 배경 이미지 생성 프롬프트. ⭐반드시 100% 영어로만 작성!⭐ 짧은 키워드 10개 이내. 반드시 "no text, empty background, blank space" 포함.
2. bgTheme: 행사 내용과 톤에 맞춰 예비 배경 테마 5개 중 1개 필수 선택 ("gold", "party", "pastel", "dark", "clean")
3. textColor: 배경과 대비되어 글씨가 잘 보일 Hex 색상 코드
4. fontType: "Gowun Dodum", "Noto Sans KR", "Jua", "Nanum Pen Script" 중 택 1
5. textShadow: 글씨 가독성을 높일 CSS 그림자 값
6. textAlign: "left", "center", "right" 중 택 1
7. fontWeight: "400", "700", "900" 중 택 1`;
            
            let userPrompt = `[행사 카테고리]: ${body.eventType}\n[현수막 문구]: ${body.bannerText}\n[분위기]: ${body.bannerVibe}\n[색상 톤]: ${body.bannerTone}`;
            let jsonSchema = {
                type: "OBJECT",
                properties: {
                    bgPrompt: { type: "STRING" }, bgTheme: { type: "STRING" }, textColor: { type: "STRING" }, fontType: { type: "STRING" }, textShadow: { type: "STRING" }, textAlign: { type: "STRING" }, fontWeight: { type: "STRING" }
                }
            };

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema }
            };

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            
            if (!response.ok) throw new Error(`구글 AI 오류: ${data.error?.message}`);
            
            let resultText = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
            return res.status(200).json({ result: JSON.parse(resultText) });
        } 
        else {
            return res.status(400).json({ error: '알 수 없는 요청입니다.' });
        }
        
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
    }
}
