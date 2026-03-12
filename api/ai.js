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
        
        // [2] 현수막 Step 1: 기획하기
        else if (action === 'banner') {
            let systemPrompt = `당신은 최고 수준의 현수막 시각 디자이너입니다. 우리는 '배경 이미지'와 '텍스트'를 따로 생성하여 합성합니다.

[작성 원칙]
1. bgPrompt: 배경 이미지 생성 프롬프트. ⭐반드시 100% 영어로만 작성!⭐ 짧은 키워드 10개 이내. 반드시 "no text, no letters, empty background, blank space" 포함할 것.
2. textColor: 배경과 대비되어 글씨가 잘 보일 Hex 색상 코드
3. fontType: "Gowun Dodum", "Noto Sans KR", "Jua", "Nanum Pen Script" 중 택 1
4. textShadow: 글씨 가독성을 높일 CSS 그림자 값
5. textAlign: "left", "center", "right" 중 택 1
6. fontWeight: "400", "700", "900" 중 택 1`;
            
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
            
            if (!response.ok) throw new Error(`구글 AI 오류: ${data.error?.message}`);
            
            let resultText = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
            return res.status(200).json({ result: JSON.parse(resultText) });
        } 
        
        // ⭐ [3] 현수막 Step 2: 백엔드가 대리(프록시)로 이미지 받아오기 (챗GPT 아이디어 적용)
        else if (action === 'banner_bg') {
            const bgPrompt = body.bgPrompt;
            const tone = body.tone || '밝은 톤';
            const width = 1200;
            const height = 420;
            
            const finalPrompt = `${bgPrompt}, clean background, empty space, no text, no letters, no watermark`;
            const seed = Math.floor(Math.random() * 1000000);
            const bgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

            try {
                // Vercel이 10초만에 강제종료 되기 전에 8초에서 우리가 먼저 끊어버립니다!
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                const response = await fetch(bgUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) throw new Error("이미지 서버 오류");

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) throw new Error("이미지 아님");

                // 이미지를 바이너리로 받아서 텍스트(Base64)로 변환해 프론트에 꽂아줍니다.
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                
                return res.status(200).json({ result: `data:${contentType};base64,${base64}`, isFallback: false });

            } catch (error) {
                console.warn("외국 서버 응답 실패, 자체 예비 이미지 생성!");
                // 에러 발생 시 무한로딩 하지 않고, 백엔드가 직접 단색 배경을 그려서 보내줍니다.
                let color1 = '#f8fafc', color2 = '#dbeafe';
                if (tone.includes('어둡')) { color1 = '#1f2937'; color2 = '#000000'; }
                else if (tone.includes('쨍한')) { color1 = '#ef4444'; color2 = '#b91c1c'; }
                else if (tone.includes('파스텔')) { color1 = '#fce7f3'; color2 = '#e9d5ff'; }

                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color1}" /><stop offset="100%" stop-color="${color2}" /></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/></svg>`;
                const svgBase64 = Buffer.from(svg).toString('base64');
                
                return res.status(200).json({ result: `data:image/svg+xml;base64,${svgBase64}`, isFallback: true });
            }
        }
        else {
            return res.status(400).json({ error: '알 수 없는 요청입니다.' });
        }
        
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
    }
}
