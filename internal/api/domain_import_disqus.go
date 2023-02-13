package api

import (
	"compress/gzip"
	"encoding/xml"
	"github.com/lunny/html2md"
	"gitlab.com/comentario/comentario/internal/util"
	"io"
	"net/http"
	"time"
)

type disqusThread struct {
	XMLName xml.Name `xml:"thread"`
	Id      string   `xml:"http://disqus.com/disqus-internals id,attr"`
	URL     string   `xml:"link"`
	Name    string   `xml:"name"`
}

type disqusAuthor struct {
	XMLName     xml.Name `xml:"author"`
	Name        string   `xml:"name"`
	IsAnonymous bool     `xml:"isAnonymous"`
	Username    string   `xml:"username"`
}

type disqusThreadId struct {
	XMLName xml.Name `xml:"thread"`
	Id      string   `xml:"http://disqus.com/disqus-internals id,attr"`
}

type disqusParentId struct {
	XMLName xml.Name `xml:"parent"`
	Id      string   `xml:"http://disqus.com/disqus-internals id,attr"`
}

type disqusPost struct {
	XMLName      xml.Name       `xml:"post"`
	Id           string         `xml:"http://disqus.com/disqus-internals id,attr"`
	ThreadId     disqusThreadId `xml:"thread"`
	ParentId     disqusParentId `xml:"parent"`
	Message      string         `xml:"message"`
	CreationDate time.Time      `xml:"createdAt"`
	IsDeleted    bool           `xml:"isDeleted"`
	IsSpam       bool           `xml:"isSpam"`
	Author       disqusAuthor   `xml:"author"`
}

type disqusXML struct {
	XMLName xml.Name       `xml:"disqus"`
	Threads []disqusThread `xml:"thread"`
	Posts   []disqusPost   `xml:"post"`
}

func domainImportDisqus(domain string, url string) (int, error) {
	if domain == "" || url == "" {
		return 0, util.ErrorMissingField
	}

	// TODO: make sure this is from disqus.com
	resp, err := http.Get(url)
	if err != nil {
		logger.Errorf("cannot get url: %v", err)
		return 0, util.ErrorCannotDownloadDisqus
	}

	defer resp.Body.Close()

	zr, err := gzip.NewReader(resp.Body)
	if err != nil {
		logger.Errorf("cannot create gzip reader: %v", err)
		return 0, util.ErrorInternal
	}

	contents, err := io.ReadAll(zr)
	if err != nil {
		logger.Errorf("cannot read gzip contents uncompressed: %v", err)
		return 0, util.ErrorInternal
	}

	x := disqusXML{}
	err = xml.Unmarshal(contents, &x)
	if err != nil {
		logger.Errorf("cannot unmarshal XML: %v", err)
		return 0, util.ErrorInternal
	}

	// Map Disqus thread IDs to threads.
	threads := make(map[string]disqusThread)
	for _, thread := range x.Threads {
		threads[thread.Id] = thread
	}

	// Map Disqus emails to commenterHex (if not available, create a new one
	// with a random password that can be reset later).
	commenterHex := map[string]string{}
	for _, post := range x.Posts {
		if post.IsDeleted || post.IsSpam {
			continue
		}

		email := post.Author.Username + "@disqus.com"

		if _, ok := commenterHex[email]; ok {
			continue
		}

		c, err := commenterGetByEmail("commento", email)
		if err != nil && err != util.ErrorNoSuchCommenter {
			logger.Errorf("cannot get commenter by email: %v", err)
			return 0, util.ErrorInternal
		}

		if err == nil {
			commenterHex[email] = c.CommenterHex
			continue
		}

		randomPassword, err := util.RandomHex(32)
		if err != nil {
			logger.Errorf("cannot generate random password for new commenter: %v", err)
			return 0, util.ErrorInternal
		}

		commenterHex[email], err = commenterNew(email, post.Author.Name, "undefined", "undefined", "commento", randomPassword)
		if err != nil {
			return 0, err
		}
	}

	// For each Disqus post, create a Comentario comment. Attempt to convert the
	// HTML to markdown.
	numImported := 0
	disqusIdMap := map[string]string{}
	for _, post := range x.Posts {
		if post.IsDeleted || post.IsSpam {
			continue
		}

		cHex := "anonymous"
		if !post.Author.IsAnonymous {
			cHex = commenterHex[post.Author.Username+"@disqus.com"]
		}

		parentHex := "root"
		if val, ok := disqusIdMap[post.ParentId.Id]; ok {
			parentHex = val
		}

		// TODO: restrict the list of tags to just the basics: <a>, <b>, <i>, <code>
		// Especially remove <img> (convert it to <a>).
		commentHex, err := commentNew(
			cHex,
			domain,
			pathStrip(threads[post.ThreadId.Id].URL),
			parentHex,
			html2md.Convert(post.Message),
			"approved",
			post.CreationDate)
		if err != nil {
			return numImported, err
		}

		disqusIdMap[post.Id] = commentHex
		numImported += 1
	}

	return numImported, nil
}

func domainImportDisqusHandler(w http.ResponseWriter, r *http.Request) {
	type request struct {
		OwnerToken *string `json:"ownerToken"`
		Domain     *string `json:"domain"`
		URL        *string `json:"url"`
	}

	var x request
	if err := BodyUnmarshal(r, &x); err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	o, err := ownerGetByOwnerToken(*x.OwnerToken)
	if err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	domain := domainStrip(*x.Domain)
	isOwner, err := domainOwnershipVerify(o.OwnerHex, domain)
	if err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	if !isOwner {
		BodyMarshalChecked(w, response{"success": false, "message": util.ErrorNotAuthorised.Error()})
		return
	}

	numImported, err := domainImportDisqus(domain, *x.URL)
	if err != nil {
		BodyMarshalChecked(w, response{"success": false, "message": err.Error()})
		return
	}

	BodyMarshalChecked(w, response{"success": true, "numImported": numImported})
}
